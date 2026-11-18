import { ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { installWebLocks } from "../test-support/web-locks";
import { createInventoryJournal } from "./journal/journal";
import { createMemoryJournalStore } from "./journal/store";
import {
  buildVariants,
  createStepKeys,
  emptyProgress,
  NewStockStepError,
  runReceiveNewStock,
  type NewStockClient,
  type NewStockPlan,
} from "./receive-new-stock";

const OWNER = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  membershipId: "33333333-3333-4333-8333-333333333333",
};
const LOCATION = "55555555-5555-4555-8555-555555555555";

function counter(prefix: string) {
  let i = 0;
  return () => `${prefix}${++i}`;
}

function fakeClient() {
  const variantIds = counter("variant-");
  const client = {
    createProduct: vi.fn(async () => ({ productId: "product-1", status: "draft" })),
    setProductStatus: vi.fn(async () => ({ productId: "product-1", status: "active" })),
    createVariant: vi.fn(async () => ({ variantId: variantIds() })),
    setVariantPrice: vi.fn(async (args: { idempotencyKey: string }) => ({
      key: args.idempotencyKey,
    })),
    setVariantCost: vi.fn(async () => ({})),
    receiveInventory: vi.fn(async (args: { variantId: string; quantity: number }) => ({
      operationId: "op",
      variantId: args.variantId,
      inventoryLocationId: LOCATION,
      observedOnHand: args.quantity,
      version: 1,
    })),
    adjustInventory: vi.fn(),
    transferInventory: vi.fn(),
    getCollection: vi.fn(async () => ({ productIds: ["other-product"] })),
    setCollectionProducts: vi.fn(async () => ({})),
    publishProduct: vi.fn(async () => ({})),
  };
  return client;
}

function plan(overrides: Partial<NewStockPlan> = {}): NewStockPlan {
  return {
    brandId: "brand-1",
    name: "Linen Shirt",
    currency: "EGP",
    priceMinor: 45000,
    costMinor: 20000,
    inventoryLocationId: LOCATION,
    variants: buildVariants(
      "Linen Shirt",
      "",
      [
        { size: "M", quantity: 3 },
        { size: "L", quantity: 0 },
      ],
      0,
    ),
    categoryId: "collection-1",
    publish: false,
    ...overrides,
  };
}

beforeEach(() => installWebLocks());

describe("buildVariants", () => {
  it("builds one SKU per size from the style code (or the name), like the POS", () => {
    expect(buildVariants("Linen Shirt", "ls 01", [{ size: "XL", quantity: 2 }], 0)).toEqual([
      { label: "XL", sku: "LS-01-XL", quantity: 2 },
    ]);
    expect(buildVariants("Linen Shirt", "", [], 5)).toEqual([
      { label: null, sku: "LINEN-SHIRT", quantity: 5 },
    ]);
  });
});

describe("runReceiveNewStock", () => {
  it("creates, activates, prices, costs, stocks, categorizes — in the POS order", async () => {
    const client = fakeClient();
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER, counter("key-"));
    const result = await runReceiveNewStock({
      client: client as unknown as NewStockClient,
      journal,
      plan: plan(),
      progress: emptyProgress(),
      keyFor: createStepKeys(counter("k-")),
    });

    expect(result).toEqual({ productId: "product-1", totalUnits: 3 });
    expect(client.setProductStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
    expect(client.createVariant).toHaveBeenCalledTimes(2);
    expect(client.setVariantPrice).toHaveBeenCalledTimes(2);
    expect(client.setVariantCost).toHaveBeenCalledTimes(2);
    // Only sizes with a quantity get opening stock.
    expect(client.receiveInventory).toHaveBeenCalledTimes(1);
    expect(client.receiveInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        variantId: "variant-1",
        quantity: 3,
        inventoryLocationId: LOCATION,
      }),
    );
    // Category membership is appended, never overwritten.
    expect(client.setCollectionProducts).toHaveBeenCalledWith(
      expect.objectContaining({ productIds: ["other-product", "product-1"] }),
    );
    // A confirmed opening receipt leaves nothing to recover.
    expect(await journal.findRecoverable()).toEqual([]);
  });

  it("resumes after a dropped connection without creating a duplicate item", async () => {
    const client = fakeClient();
    client.setVariantPrice.mockRejectedValueOnce(new ApiNetworkError("down"));
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER, counter("key-"));
    const progress = emptyProgress();
    const keyFor = createStepKeys(counter("k-"));
    const args = {
      client: client as unknown as NewStockClient,
      journal,
      plan: plan(),
      progress,
      keyFor,
    };

    await expect(runReceiveNewStock(args)).rejects.toBeInstanceOf(NewStockStepError);
    const firstPriceKey = client.setVariantPrice.mock.calls[0][0].idempotencyKey;

    await runReceiveNewStock(args);
    expect(client.createProduct).toHaveBeenCalledTimes(1);
    expect(client.createVariant).toHaveBeenCalledTimes(2);
    // The retried step reuses its original key, so the service can never apply it twice.
    expect(client.setVariantPrice.mock.calls[1][0].idempotencyKey).toBe(firstPriceKey);
  });

  it("treats a failed online listing as a warning — the item stays created", async () => {
    const client = fakeClient();
    client.publishProduct.mockRejectedValueOnce(new ApiNetworkError("down"));
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER, counter("key-"));
    const result = await runReceiveNewStock({
      client: client as unknown as NewStockClient,
      journal,
      plan: plan({ publish: true }),
      progress: emptyProgress(),
      keyFor: createStepKeys(counter("k-")),
    });
    expect(result.productId).toBe("product-1");
    expect(result.publishError?.kind).toBe("network");
  });

  it("keeps an unconfirmed opening receipt in the journal so the Stock page can finish it", async () => {
    const client = fakeClient();
    client.receiveInventory.mockRejectedValueOnce(new ApiNetworkError("down"));
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER, counter("key-"));
    await expect(
      runReceiveNewStock({
        client: client as unknown as NewStockClient,
        journal,
        plan: plan({ categoryId: null }),
        progress: emptyProgress(),
        keyFor: createStepKeys(counter("k-")),
      }),
    ).rejects.toMatchObject({ step: { kind: "stock" } });
    const pending = await journal.findRecoverable();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ status: "sent", operationType: "receive" });
  });
});

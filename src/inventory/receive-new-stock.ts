import type { TenantCommerceClient } from "@shifted/clothing-commerce-sdk";

import { classifyCommerceError, type ClassifiedCommerceError } from "../commerce/errors";
import { slugify } from "../catalog/operations";
import type { IdempotencyKeyFactory } from "./idempotency";
import { runJournaledCommand } from "./journal/command-runner";
import type { InventoryJournal } from "./journal/journal";
import { normalizeReceivePayload, payloadIdentity } from "./journal/model";
import { describeInventoryWriteError } from "./write-errors";

// "Receive new stock" — the same flow as the POS "Add product" desk: name the item, pick a brand and
// a category, set one selling price (and optional unit cost), tick the sizes you received with a
// quantity for each, and choose where the stock goes. It runs create product → activate → for each
// size (create variant → price → cost → opening stock) → category → optional online listing.
//
// Unlike the POS, every step here is RESUMABLE: each step keeps its own idempotency key and records
// what it finished in `progress`, so pressing "Try again" after a dropped connection continues where it
// stopped and can never create a duplicate product or count stock twice. Opening stock is written
// through the durable inventory journal, so an unconfirmed receipt also shows up on the Stock page to be
// finished safely.

export const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
export const SHOE_SIZES = ["36", "37", "38", "39", "40", "41", "42", "43", "44"] as const;

export type NewStockClient = Pick<
  TenantCommerceClient,
  | "createProduct"
  | "setProductStatus"
  | "createVariant"
  | "setVariantPrice"
  | "setVariantCost"
  | "receiveInventory"
  | "adjustInventory"
  | "transferInventory"
  | "getCollection"
  | "setCollectionProducts"
  | "publishProduct"
>;

export interface NewStockVariant {
  /** Size label shown to shoppers ("M", "42"); null for a one-size item. */
  label: string | null;
  sku: string;
  quantity: number;
}

export interface NewStockPlan {
  brandId: string;
  name: string;
  styleCode?: string;
  currency: string;
  priceMinor: number;
  costMinor: number | null;
  inventoryLocationId: string;
  variants: NewStockVariant[];
  categoryId: string | null;
  publish: boolean;
}

/** What has already been done, so a retry skips it. Owned by the caller (kept across attempts). */
export interface NewStockProgress {
  productId?: string;
  activated?: boolean;
  variants: Record<
    string,
    { variantId?: string; priced?: boolean; costed?: boolean; received?: boolean }
  >;
  categorized?: boolean;
  published?: boolean;
}

export type NewStockStep =
  | { kind: "product" }
  | { kind: "variant"; sku: string }
  | { kind: "stock"; sku: string }
  | { kind: "category" }
  | { kind: "publish" };

export interface NewStockResult {
  productId: string;
  totalUnits: number;
  /** Set when the item was created but listing it online failed (non-fatal). */
  publishError?: ClassifiedCommerceError;
}

/** Thrown when a step fails. The plan can be re-run with the same progress + keys to continue. */
export class NewStockStepError extends Error {
  constructor(
    readonly step: NewStockStep,
    readonly error: ClassifiedCommerceError,
  ) {
    super(error.message);
    this.name = "NewStockStepError";
  }
}

function slugSuffix(key: string): string {
  return (
    key
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(-4) || "item"
  );
}

export function emptyProgress(): NewStockProgress {
  return { variants: {} };
}

/** SKU-safe token: uppercase letters, digits and dashes. */
export function skuToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Builds the per-size SKUs exactly like the POS: `<STYLE or NAME>-<SIZE>`, or the base for one size. */
export function buildVariants(
  name: string,
  styleCode: string,
  sizes: readonly { size: string; quantity: number }[],
  standardQuantity: number,
): NewStockVariant[] {
  const base = skuToken(styleCode) || skuToken(name) || "ITEM";
  if (sizes.length === 0)
    return [{ label: null, sku: base, quantity: Math.max(0, standardQuantity) }];
  return sizes.map(({ size, quantity }) => ({
    label: size,
    sku: `${base}-${skuToken(size)}`,
    quantity: Math.max(0, quantity),
  }));
}

/**
 * Stable idempotency key per step: the first attempt mints it, every retry reuses it, so an ambiguous
 * failure can be retried without duplicating anything.
 */
export function createStepKeys(generate: IdempotencyKeyFactory): (step: string) => string {
  const keys = new Map<string, string>();
  return (step) => {
    let key = keys.get(step);
    if (!key) {
      key = generate();
      keys.set(step, key);
    }
    return key;
  };
}

export async function runReceiveNewStock(args: {
  client: NewStockClient;
  journal: InventoryJournal;
  plan: NewStockPlan;
  progress: NewStockProgress;
  keyFor: (step: string) => string;
  onStep?: (step: NewStockStep) => void;
}): Promise<NewStockResult> {
  const { client, journal, plan, progress, keyFor, onStep } = args;

  async function step<T>(info: NewStockStep, run: () => Promise<T>): Promise<T> {
    onStep?.(info);
    try {
      return await run();
    } catch (error) {
      if (error instanceof NewStockStepError) throw error;
      throw new NewStockStepError(info, classifyCommerceError(error));
    }
  }

  // 1. Product (+ activate so it can be sold straight away, as the POS does).
  if (!progress.productId) {
    const created = await step({ kind: "product" }, () =>
      client.createProduct({
        idempotencyKey: keyFor("product"),
        brandId: plan.brandId,
        name: plan.name,
        // Like the POS, a short suffix keeps the web address unique (names in Arabic slugify to
        // nothing). Derived from this step's key, so a retry sends the identical request.
        slug: `${slugify(plan.name) || "product"}-${slugSuffix(keyFor("product"))}`,
        ...(plan.styleCode ? { styleCode: plan.styleCode } : {}),
      }),
    );
    progress.productId = created.productId;
    progress.activated = created.status === "active";
  }
  const productId = progress.productId;
  if (!progress.activated) {
    await step({ kind: "product" }, () =>
      client.setProductStatus({ idempotencyKey: keyFor("activate"), productId, status: "active" }),
    );
    progress.activated = true;
  }

  // 2. Each size: variant → price → cost → opening stock.
  for (const variant of plan.variants) {
    const done = (progress.variants[variant.sku] ??= {});
    if (!done.variantId) {
      const created = await step({ kind: "variant", sku: variant.sku }, () =>
        client.createVariant({
          idempotencyKey: keyFor(`variant:${variant.sku}`),
          productId,
          sku: variant.sku,
          ...(variant.label ? { displayName: variant.label } : {}),
        }),
      );
      done.variantId = created.variantId;
    }
    const variantId = done.variantId;
    if (!done.priced) {
      await step({ kind: "variant", sku: variant.sku }, () =>
        client.setVariantPrice({
          idempotencyKey: keyFor(`price:${variant.sku}`),
          variantId,
          currency: plan.currency,
          amountMinor: plan.priceMinor,
        }),
      );
      done.priced = true;
    }
    if (!done.costed && plan.costMinor !== null) {
      const unitCostMinor = plan.costMinor;
      await step({ kind: "variant", sku: variant.sku }, () =>
        client.setVariantCost({
          idempotencyKey: keyFor(`cost:${variant.sku}`),
          variantId,
          unitCostMinor,
        }),
      );
      done.costed = true;
    }
    if (!done.received && variant.quantity > 0) {
      await step({ kind: "stock", sku: variant.sku }, () =>
        receiveThroughJournal(client, journal, {
          variantId,
          inventoryLocationId: plan.inventoryLocationId,
          quantity: variant.quantity,
        }),
      );
      done.received = true;
    }
  }

  // 3. Category (a collection). setCollectionProducts replaces membership, so append to the current set.
  if (plan.categoryId && !progress.categorized) {
    const collectionId = plan.categoryId;
    await step({ kind: "category" }, async () => {
      const detail = await client.getCollection(collectionId);
      if (!detail.productIds.includes(productId)) {
        await client.setCollectionProducts({
          idempotencyKey: keyFor("category"),
          collectionId,
          productIds: [...detail.productIds, productId],
        });
      }
    });
    progress.categorized = true;
  }

  const totalUnits = plan.variants.reduce((sum, v) => sum + v.quantity, 0);

  // 4. Online listing is secondary: the item is already created and stocked, so a failure here is a
  // warning, never a failure that would tempt the owner to create the item again.
  if (plan.publish && !progress.published) {
    onStep?.({ kind: "publish" });
    try {
      await client.publishProduct({ idempotencyKey: keyFor("publish"), productId });
      progress.published = true;
    } catch (error) {
      return { productId, totalUnits, publishError: classifyCommerceError(error) };
    }
  }

  return { productId, totalUnits };
}

/**
 * One opening-stock receipt through the durable journal: persisted before sending, marked accepted on
 * success and acknowledged. A definitive rejection is recorded; an ambiguous one is left unresolved so
 * the Stock page's recovery panel can finish it with the same key.
 */
async function receiveThroughJournal(
  client: NewStockClient,
  journal: InventoryJournal,
  args: { variantId: string; inventoryLocationId: string; quantity: number },
): Promise<void> {
  const payload = normalizeReceivePayload(args);
  const identity = payloadIdentity(payload);
  const entry =
    (await journal.findEquivalentUnresolved(payload)) ?? (await journal.prepare(payload));
  await journal.markSent(entry.commandKey, identity);
  try {
    const result = await runJournaledCommand(client, entry.payload, entry.commandKey);
    await journal.recordAccepted(entry.commandKey, result, identity);
    await journal.acknowledge(entry.commandKey, identity).catch(() => undefined);
  } catch (error) {
    const classified = classifyCommerceError(error);
    if (describeInventoryWriteError(classified).recovery !== "retry") {
      await journal.recordRejected(entry.commandKey, identity).catch(() => undefined);
    }
    throw error;
  }
}

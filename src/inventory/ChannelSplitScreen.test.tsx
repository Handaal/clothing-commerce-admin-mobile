// @vitest-environment jsdom
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INVENTORY_LOCATION_A,
  TENANT_A,
  VARIANT_A,
  inventoryItem,
  inventoryList,
  meContext,
} from "../test-support/fixtures";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused" }));

import { ChannelSplitScreen, type ChannelSplitClient } from "./ChannelSplitScreen";

const LOCATION = { id: INVENTORY_LOCATION_A, name: "Flagship Stockroom", branchId: null };

function context(canAdjust: boolean) {
  return meContext(TENANT_A, {
    inventory: {
      canRead: true,
      tenantWide: true,
      locations: [LOCATION],
      write: {
        canReceive: canAdjust,
        canAdjust,
        canTransfer: false,
        locations: [
          {
            id: INVENTORY_LOCATION_A,
            name: "Flagship Stockroom",
            canReceive: canAdjust,
            canAdjust,
            canTransferOrigin: false,
            canTransferDestination: false,
          },
        ],
      },
    },
  });
}

function channelItem(overrides: Record<string, unknown> = {}) {
  return {
    variantId: VARIANT_A,
    canonicalOnHand: 10,
    websiteOnHand: 0,
    websiteReserved: 0,
    websiteAvailable: 0,
    posOnHand: 0,
    posReserved: 0,
    posAvailable: 0,
    unallocatedOnHand: 10,
    mismatch: 0,
    explicitlyAllocated: false,
    balanceVersion: 4,
    allocationVersion: 2,
    ...overrides,
  };
}

function makeClient(mode: "legacy" | "shadow"): ChannelSplitClient & {
  [K in keyof ChannelSplitClient]: ReturnType<typeof vi.fn>;
} {
  let current = mode;
  return {
    listInventory: vi.fn(async () => inventoryList([inventoryItem({ onHand: 10, version: 4 })])),
    getInventoryChannels: vi.fn(async () => ({
      inventoryLocationId: INVENTORY_LOCATION_A,
      mode: current,
      items: current === "legacy" ? [] : [channelItem()],
    })),
    initializeInventoryChannels: vi.fn(async () => {
      current = "shadow";
      return {
        inventoryLocationId: INVENTORY_LOCATION_A,
        mode: "shadow" as const,
        initialized: true,
        allocationRunId: "00000000-0000-4000-8000-000000000001",
      };
    }),
    allocateInventoryChannels: vi.fn(async () => ({
      allocationRunId: "00000000-0000-4000-8000-000000000002",
      inventoryLocationId: INVENTORY_LOCATION_A,
      items: [
        channelItem({
          websiteOnHand: 4,
          posOnHand: 5,
          unallocatedOnHand: 1,
          explicitlyAllocated: true,
        }),
      ],
    })),
  } as never;
}

let keyCounter = 0;
const nextKey = () => `key-${++keyCounter}`;

afterEach(() => {
  cleanup();
  keyCounter = 0;
});

describe("ChannelSplitScreen", () => {
  it("offers set-up on a legacy location and switches to trial mode after it", async () => {
    const client = makeClient("legacy");
    render(<ChannelSplitScreen client={client} context={context(true)} generateKey={nextKey} />);
    expect(await screen.findByTestId("split-legacy")).toBeTruthy();
    fireEvent.click(screen.getByTestId("split-set-up"));
    await waitFor(() =>
      expect(client.initializeInventoryChannels).toHaveBeenCalledWith({
        inventoryLocationId: INVENTORY_LOCATION_A,
        idempotencyKey: "key-1",
      }),
    );
    expect(await screen.findByTestId("split-trial")).toBeTruthy();
    expect(screen.getByTestId(`split-row-${VARIANT_A}-not-split`)).toBeTruthy();
  });

  it("hides set-up from a read-only account", async () => {
    render(
      <ChannelSplitScreen
        client={makeClient("legacy")}
        context={context(false)}
        generateKey={nextKey}
      />,
    );
    expect(await screen.findByTestId("split-legacy")).toBeTruthy();
    expect(screen.queryByTestId("split-set-up")).toBeNull();
  });

  it("shows the remainder live, blocks an over-split, and saves only the changed row", async () => {
    const client = makeClient("shadow");
    render(<ChannelSplitScreen client={client} context={context(true)} generateKey={nextKey} />);
    const website = (await screen.findByTestId(
      `split-row-${VARIANT_A}-website`,
    )) as HTMLInputElement;
    const pos = screen.getByTestId(`split-row-${VARIANT_A}-pos`) as HTMLInputElement;
    const save = () => screen.getByTestId("split-save");

    fireEvent.change(website, { target: { value: "8" } });
    fireEvent.change(pos, { target: { value: "5" } });
    expect(screen.getByTestId(`split-row-${VARIANT_A}-error`).textContent).toContain("10");
    expect(save().getAttribute("aria-disabled")).toBe("true");

    fireEvent.change(website, { target: { value: "4" } });
    expect(screen.getByTestId(`split-row-${VARIANT_A}-unallocated`).textContent).toBe("1");
    fireEvent.click(save());

    await waitFor(() =>
      expect(client.allocateInventoryChannels).toHaveBeenCalledWith({
        inventoryLocationId: INVENTORY_LOCATION_A,
        reason: "Website/POS split update",
        lines: [
          {
            variantId: VARIANT_A,
            websiteQuantity: 4,
            posQuantity: 5,
            expectedBalanceVersion: 4,
            expectedAllocationVersion: 2,
          },
        ],
        idempotencyKey: "key-1",
      }),
    );
    expect(await screen.findByTestId("split-saved")).toBeTruthy();
  });

  it("reloads and explains when stock changed under the owner", async () => {
    const client = makeClient("shadow");
    client.allocateInventoryChannels.mockRejectedValueOnce(
      new ApiHttpError("changed", 409, "CONCURRENT_MODIFICATION", null),
    );
    render(<ChannelSplitScreen client={client} context={context(true)} generateKey={nextKey} />);
    fireEvent.change(await screen.findByTestId(`split-row-${VARIANT_A}-website`), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByTestId("split-save"));
    expect(await screen.findByTestId("split-changed")).toBeTruthy();
    expect(client.getInventoryChannels).toHaveBeenCalledTimes(2);
  });
});

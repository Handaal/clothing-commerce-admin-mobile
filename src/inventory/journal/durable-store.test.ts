// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { createWebJournalStore } from "./durable-store";
import type { JournalEntry } from "./model";

const STORAGE_KEY = "admin-mobile.inventory-journal.v1";

function entry(commandKey: string): JournalEntry {
  return {
    commandKey,
    tenantId: "11111111-1111-4111-8111-111111111111",
    operationType: "receive",
    payload: {
      type: "receive",
      variantId: "77777777-7777-4777-8777-777777777777",
      inventoryLocationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      quantity: 2,
    },
    payloadIdentity: "id",
    preparedAt: "2026-09-27T10:00:00.000Z",
    status: "sent",
  };
}

afterEach(() => localStorage.clear());

describe("web durable journal store", () => {
  it("returns an empty document before anything is written", async () => {
    const store = createWebJournalStore();
    expect(await store.read()).toEqual({ version: 1, entries: [] });
  });

  it("persists across a simulated restart (a fresh store reads the same localStorage)", async () => {
    const writer = createWebJournalStore();
    await writer.write({ version: 1, entries: [entry("K1")] });

    // A new store instance models a relaunched app; the persisted command is still present.
    const reopened = createWebJournalStore();
    const document = await reopened.read();
    expect(document.entries).toHaveLength(1);
    expect(document.entries[0]).toMatchObject({ commandKey: "K1", status: "sent" });
  });

  it("degrades to an empty document when the stored value is corrupt (never throws)", async () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    const store = createWebJournalStore();
    expect(await store.read()).toEqual({ version: 1, entries: [] });
  });

  it("drops malformed entries but keeps well-formed ones", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, entries: [entry("K1"), { garbage: true }] }),
    );
    const store = createWebJournalStore();
    const document = await store.read();
    expect(document.entries).toHaveLength(1);
    expect(document.entries[0]?.commandKey).toBe("K1");
  });
});

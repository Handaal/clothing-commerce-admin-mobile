import { describe, expect, it } from "vitest";

import { JournalCorruptError, normalizeReceivePayload, payloadIdentity } from "./model";
import { parsePersisted, safeGeneration, serializePersisted } from "./validation";

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const VARIANT = "77777777-7777-4777-8777-777777777777";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const RECEIVE = normalizeReceivePayload({
  variantId: VARIANT,
  inventoryLocationId: LOCATION,
  quantity: 2,
});

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    commandKey: "K1",
    tenantId: TENANT,
    actorMembershipId: MEMBER,
    operationType: "receive",
    payload: RECEIVE,
    payloadIdentity: payloadIdentity(RECEIVE),
    preparedAt: "2026-09-27T10:00:00.000Z",
    status: "sent",
    ...overrides,
  };
}

function doc(entries: unknown[], generation = 1) {
  return JSON.stringify({ version: 2, generation, entries });
}

describe("strict journal validation", () => {
  it("round-trips a valid document", () => {
    const parsed = parsePersisted(doc([baseEntry()]));
    expect(parsed.generation).toBe(1);
    expect(parsed.entries).toHaveLength(1);
  });

  it("serialize + parse are inverse", () => {
    const entries = parsePersisted(doc([baseEntry({ status: "prepared" })])).entries;
    const parsed = parsePersisted(serializePersisted(entries, 7));
    expect(parsed.generation).toBe(7);
    expect(parsed.entries[0]?.commandKey).toBe("K1");
  });

  // Each adversarial class must make the WHOLE document corrupt (never silently drop the entry).
  const cases: Record<string, unknown> = {
    "invalid status": baseEntry({ status: "weird" }),
    "acknowledged is not a persisted status": baseEntry({ status: "acknowledged" }),
    "invalid operation": baseEntry({ operationType: "destroy" }),
    "missing membership": baseEntry({ actorMembershipId: "" }),
    "missing tenant": baseEntry({ tenantId: "" }),
    "missing key": baseEntry({ commandKey: "" }),
    "bad timestamp": baseEntry({ preparedAt: "not-a-date" }),
    "payload type mismatches operation": baseEntry({
      operationType: "adjust",
      payload: RECEIVE,
      payloadIdentity: payloadIdentity(RECEIVE),
    }),
    "malformed receive (no quantity)": baseEntry({
      payload: { type: "receive", variantId: VARIANT, inventoryLocationId: LOCATION },
    }),
    "invalid quantity (zero)": (() => {
      const bad = {
        type: "receive",
        variantId: VARIANT,
        inventoryLocationId: LOCATION,
        quantity: 0,
      };
      return baseEntry({ payload: bad, payloadIdentity: payloadIdentity(bad as never) });
    })(),
    "malformed adjust (negative version)": (() => {
      const bad = {
        type: "adjust",
        variantId: VARIANT,
        inventoryLocationId: LOCATION,
        countedQuantity: 3,
        expectedVersion: -1,
      };
      return baseEntry({
        operationType: "adjust",
        payload: bad,
        payloadIdentity: payloadIdentity(bad as never),
      });
    })(),
    "malformed transfer (no destination)": (() => {
      const bad = {
        type: "transfer",
        variantId: VARIANT,
        sourceInventoryLocationId: LOCATION,
        quantity: 1,
      };
      return baseEntry({
        operationType: "transfer",
        payload: bad,
        payloadIdentity: payloadIdentity(bad as never),
      });
    })(),
    "payload identity mismatch": baseEntry({ payloadIdentity: "tampered" }),
    "accepted without a result": baseEntry({ status: "accepted" }),
    "prepared carrying a result": baseEntry({ status: "prepared", result: { observedOnHand: 5 } }),
  };

  for (const [name, entry] of Object.entries(cases)) {
    it(`rejects the whole document: ${name}`, () => {
      expect(() => parsePersisted(doc([entry]))).toThrow(JournalCorruptError);
    });
  }

  it("rejects duplicate command keys", () => {
    expect(() => parsePersisted(doc([baseEntry(), baseEntry()]))).toThrow(JournalCorruptError);
  });

  it("rejects a missing/invalid generation", () => {
    expect(() => parsePersisted(JSON.stringify({ version: 2, entries: [] }))).toThrow(
      JournalCorruptError,
    );
  });

  it("rejects non-JSON", () => {
    expect(() => parsePersisted("{oops")).toThrow(JournalCorruptError);
  });

  it("accepts an accepted entry WITH a result", () => {
    const parsed = parsePersisted(doc([baseEntry({ status: "accepted", result: { ok: true } })]));
    expect(parsed.entries[0]?.result).toEqual({ ok: true });
  });

  it("safeGeneration never throws", () => {
    expect(safeGeneration(null)).toBe(0);
    expect(safeGeneration("{oops")).toBe(0);
    expect(safeGeneration(doc([], 5))).toBe(5);
  });
});

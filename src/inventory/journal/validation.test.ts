import { describe, expect, it } from "vitest";

import {
  JournalCorruptError,
  JournalGenerationExhaustedError,
  normalizeReceivePayload,
  payloadIdentity,
  type JournalOwner,
} from "./model";
import { nextGeneration, parsePersisted, safeGeneration, serializePersisted } from "./validation";

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const VARIANT = "77777777-7777-4777-8777-777777777777";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER: JournalOwner = { tenantId: TENANT, membershipId: MEMBER };

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

describe("safe generation metadata (P1-2)", () => {
  it("accepts MAX_SAFE_INTEGER as a generation", () => {
    expect(parsePersisted(doc([], Number.MAX_SAFE_INTEGER)).generation).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("rejects an unsafe (1e308) generation that could outrank legitimate ones", () => {
    expect(() => parsePersisted(doc([], 1e308))).toThrow(JournalCorruptError);
    // ...and safeGeneration treats it as unreadable (0), never letting it suppress real evidence.
    expect(safeGeneration(doc([], 1e308))).toBe(0);
  });

  it("rejects a negative generation", () => {
    expect(() => parsePersisted(doc([], -1))).toThrow(JournalCorruptError);
  });

  it("rejects a fractional generation", () => {
    expect(() => parsePersisted(doc([], 1.5))).toThrow(JournalCorruptError);
  });

  it("rejects a NaN generation", () => {
    expect(() =>
      parsePersisted(JSON.stringify({ version: 2, generation: NaN, entries: [] })),
    ).toThrow(JournalCorruptError);
  });

  it("nextGeneration increments a safe generation", () => {
    expect(nextGeneration(0)).toBe(1);
    expect(nextGeneration(41)).toBe(42);
  });

  it("nextGeneration FAILS CLOSED at MAX_SAFE_INTEGER (never wraps or reuses)", () => {
    expect(() => nextGeneration(Number.MAX_SAFE_INTEGER)).toThrow(JournalGenerationExhaustedError);
  });

  it("nextGeneration clamps an unsafe current to 0 rather than propagating it", () => {
    expect(nextGeneration(1e308)).toBe(1);
  });

  it("serializePersisted refuses to write an unsafe generation", () => {
    expect(() => serializePersisted([], 1e308)).toThrow(JournalGenerationExhaustedError);
    expect(() => serializePersisted([], -1)).toThrow(JournalGenerationExhaustedError);
  });
});

describe("safe-integer payload numerics (P2-B)", () => {
  it("rejects a receive quantity of 1e308 (integer-valued but not safe)", () => {
    const bad = {
      type: "receive",
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      quantity: 1e308,
    };
    expect(() =>
      parsePersisted(
        doc([baseEntry({ payload: bad, payloadIdentity: payloadIdentity(bad as never) })]),
      ),
    ).toThrow(JournalCorruptError);
  });

  it("rejects an adjust expectedVersion of 1e308", () => {
    const bad = {
      type: "adjust",
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      countedQuantity: 3,
      expectedVersion: 1e308,
    };
    expect(() =>
      parsePersisted(
        doc([
          baseEntry({
            operationType: "adjust",
            payload: bad,
            payloadIdentity: payloadIdentity(bad as never),
          }),
        ]),
      ),
    ).toThrow(JournalCorruptError);
  });
});

describe("supplierReference normalized representation (P2-D)", () => {
  it("rejects an empty supplierReference (the normalizer would omit it)", () => {
    const bad = {
      type: "receive",
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      quantity: 2,
      supplierReference: "",
    };
    expect(() =>
      parsePersisted(
        doc([baseEntry({ payload: bad, payloadIdentity: payloadIdentity(bad as never) })]),
      ),
    ).toThrow(JournalCorruptError);
  });

  it("rejects a whitespace-only supplierReference", () => {
    const bad = {
      type: "receive",
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      quantity: 2,
      supplierReference: "   ",
    };
    expect(() =>
      parsePersisted(
        doc([baseEntry({ payload: bad, payloadIdentity: payloadIdentity(bad as never) })]),
      ),
    ).toThrow(JournalCorruptError);
  });

  it("accepts a meaningful supplierReference", () => {
    const ok = {
      type: "receive",
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      quantity: 2,
      supplierReference: "GRN-2026-0012",
    };
    const parsed = parsePersisted(
      doc([baseEntry({ payload: ok, payloadIdentity: payloadIdentity(ok as never) })]),
    );
    expect((parsed.entries[0]?.payload as { supplierReference?: string }).supplierReference).toBe(
      "GRN-2026-0012",
    );
  });
});

describe("expected-owner validation (P1-4)", () => {
  it("accepts a document whose entries all match the expected owner", () => {
    expect(parsePersisted(doc([baseEntry()]), OWNER).entries).toHaveLength(1);
  });

  it("rejects a foreign MEMBERSHIP within the same tenant (whole document corrupt)", () => {
    const foreign = baseEntry({ actorMembershipId: "99999999-9999-4999-8999-999999999999" });
    expect(() => parsePersisted(doc([foreign]), OWNER)).toThrow(JournalCorruptError);
  });

  it("rejects a foreign TENANT (whole document corrupt)", () => {
    const foreign = baseEntry({ tenantId: "22222222-2222-4222-8222-222222222222" });
    expect(() => parsePersisted(doc([foreign]), OWNER)).toThrow(JournalCorruptError);
  });

  it("treats a mix of correct + foreign-owner entries as entirely corrupt (never filtered)", () => {
    const mine = baseEntry({ commandKey: "MINE" });
    const foreign = baseEntry({
      commandKey: "FOREIGN",
      actorMembershipId: "99999999-9999-4999-8999-999999999999",
    });
    expect(() => parsePersisted(doc([mine, foreign]), OWNER)).toThrow(JournalCorruptError);
  });

  it("without an expected owner, well-formed entries of any owner still parse (storage-layer check)", () => {
    const other = baseEntry({ actorMembershipId: "99999999-9999-4999-8999-999999999999" });
    expect(parsePersisted(doc([other])).entries).toHaveLength(1);
  });
});

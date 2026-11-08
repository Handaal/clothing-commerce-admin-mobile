import { describe, expect, it } from "vitest";

import type { ClassifiedCommerceError } from "../commerce/errors";
import { describeReturnWriteError } from "./write-errors";

function err(partial: Partial<ClassifiedCommerceError>): ClassifiedCommerceError {
  return { kind: "server", message: "x", ...partial };
}

describe("describeReturnWriteError", () => {
  it("maps auth / forbidden to a terminal (none) recovery", () => {
    expect(describeReturnWriteError(err({ kind: "auth" })).recovery).toBe("none");
    expect(describeReturnWriteError(err({ kind: "forbidden" })).recovery).toBe("none");
  });

  it("maps stale returnable quantity to reload", () => {
    expect(describeReturnWriteError(err({ code: "RETURN_QUANTITY_EXCEEDED" })).recovery).toBe(
      "reload",
    );
    expect(describeReturnWriteError(err({ code: "ORDER_LINE_MISMATCH" })).recovery).toBe("reload");
  });

  it("maps a refund-settlement conflict to reload", () => {
    expect(describeReturnWriteError(err({ code: "REFUND_CONFLICT" })).recovery).toBe("reload");
  });

  it("maps correctable rejections to edit", () => {
    expect(describeReturnWriteError(err({ code: "RESTOCK_LOCATION_UNAVAILABLE" })).recovery).toBe(
      "edit",
    );
    expect(describeReturnWriteError(err({ code: "RETURN_REASON_NOT_ALLOWED" })).recovery).toBe(
      "edit",
    );
    expect(describeReturnWriteError(err({ code: "INVALID_RETURN" })).recovery).toBe("edit");
  });

  it("maps policy / order-state rejections to none", () => {
    for (const code of [
      "RETURNS_DISABLED",
      "ORDER_NOT_RETURNABLE",
      "PAYMENT_NOT_CAPTURED",
      "RETURN_WINDOW_EXPIRED",
      "MANUAL_REFUND_NOT_ALLOWED",
      "RETURN_NOT_FOUND",
      "IDEMPOTENCY_CONFLICT",
    ]) {
      expect(describeReturnWriteError(err({ code })).recovery).toBe("none");
    }
  });

  it("treats a network failure as an ambiguous retry (same key)", () => {
    expect(describeReturnWriteError(err({ kind: "network" })).recovery).toBe("retry");
  });

  it("falls back to retry for an unmapped server error", () => {
    expect(describeReturnWriteError(err({ kind: "server", code: "WHATEVER" })).recovery).toBe(
      "retry",
    );
  });
});

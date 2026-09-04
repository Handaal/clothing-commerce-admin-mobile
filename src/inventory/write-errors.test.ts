import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it } from "vitest";

import { classifyCommerceError } from "../commerce/errors";
import { describeInventoryWriteError } from "./write-errors";

function described(error: unknown) {
  return describeInventoryWriteError(classifyCommerceError(error));
}

describe("describeInventoryWriteError", () => {
  it("routes a stale-version 409 to the refresh-and-recount flow (never a blind retry)", () => {
    const d = described(new ApiHttpError("no", 409, "CONCURRENT_MODIFICATION", null));
    expect(d.recovery).toBe("reconcile");
    expect(d.isConcurrencyConflict).toBe(true);
  });

  it("treats an ambiguous network failure as retryable (same key reused by the caller)", () => {
    const d = described(new ApiNetworkError("down"));
    expect(d.recovery).toBe("retry");
    expect(d.isConcurrencyConflict).toBe(false);
  });

  it("routes insufficient stock to an editable correction, not a retry", () => {
    const d = described(new ApiHttpError("no", 409, "INSUFFICIENT_STOCK", null));
    expect(d.recovery).toBe("edit");
  });

  it("marks a 403 as terminal access-denied with no retry affordance", () => {
    const d = described(new ApiHttpError("no", 403, "FORBIDDEN", null));
    expect(d.recovery).toBe("none");
    expect(d.heading).toBe("Access denied");
  });

  it("treats an idempotency-key/payload conflict as terminal (start a new operation)", () => {
    const d = described(new ApiHttpError("no", 409, "IDEMPOTENCY_CONFLICT", null));
    expect(d.recovery).toBe("none");
  });

  it("treats an unclassified 5xx as retryable", () => {
    const d = described(new ApiHttpError("no", 500, "HTTP_ERROR", null));
    expect(d.recovery).toBe("retry");
  });
});

import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it } from "vitest";

import { classifyCommerceError } from "../commerce/errors";
import {
  categorizeStaffWriteError,
  describeStaffWriteError,
  STAFF_ERROR_CODES,
} from "./write-errors";

function httpError(status: number, code: string) {
  return classifyCommerceError(new ApiHttpError("nope", status, code, "req-1"));
}

describe("categorizeStaffWriteError", () => {
  it("maps the anti-escalation code (privilege escalation / foreign scope) to a distinct, non-actionable category", () => {
    const error = httpError(403, STAFF_ERROR_CODES.privilegeEscalation);
    expect(categorizeStaffWriteError(error)).toBe("cannot-delegate");
    expect(describeStaffWriteError(error).recovery).toBe("none");
  });

  it("maps the last-admin code distinctly from a generic 403", () => {
    expect(categorizeStaffWriteError(httpError(409, STAFF_ERROR_CODES.lastAdmin))).toBe(
      "last-admin",
    );
    // A generic 403 with no known code is a plain access denial, not last-admin.
    expect(categorizeStaffWriteError(httpError(403, "FORBIDDEN"))).toBe("denied");
  });

  it("maps a staff conflict (already a member / revoked / refused transition) distinctly", () => {
    const error = httpError(409, STAFF_ERROR_CODES.staffConflict);
    expect(categorizeStaffWriteError(error)).toBe("staff-conflict");
    expect(describeStaffWriteError(error).recovery).toBe("none");
  });

  it("maps an inactive identity to an editable recovery (choose again)", () => {
    const error = httpError(409, STAFF_ERROR_CODES.identityInactive);
    expect(categorizeStaffWriteError(error)).toBe("identity-inactive");
    expect(describeStaffWriteError(error).recovery).toBe("edit");
  });

  it("maps an invalid request to an editable recovery", () => {
    const error = httpError(422, STAFF_ERROR_CODES.invalid);
    expect(categorizeStaffWriteError(error)).toBe("invalid");
    expect(describeStaffWriteError(error).recovery).toBe("edit");
  });

  it("maps a missing membership/target to not-found", () => {
    expect(categorizeStaffWriteError(httpError(404, STAFF_ERROR_CODES.notFound))).toBe("not-found");
  });

  it("never hides an idempotency conflict — it is terminal", () => {
    const error = httpError(409, STAFF_ERROR_CODES.idempotencyConflict);
    expect(categorizeStaffWriteError(error)).toBe("conflict");
    expect(describeStaffWriteError(error).recovery).toBe("none");
  });

  it("classifies an ambiguous network failure as retryable", () => {
    const error = classifyCommerceError(new ApiNetworkError("down"));
    expect(categorizeStaffWriteError(error)).toBe("ambiguous");
    expect(describeStaffWriteError(error).recovery).toBe("retry");
  });

  it("maps auth (401) to a terminal session problem", () => {
    const error = httpError(401, "UNAUTHENTICATED");
    expect(categorizeStaffWriteError(error)).toBe("session");
    expect(describeStaffWriteError(error).recovery).toBe("none");
  });

  it("keeps each real business code distinct rather than collapsing to one generic error", () => {
    const categories = new Set([
      categorizeStaffWriteError(httpError(403, STAFF_ERROR_CODES.privilegeEscalation)),
      categorizeStaffWriteError(httpError(409, STAFF_ERROR_CODES.lastAdmin)),
      categorizeStaffWriteError(httpError(409, STAFF_ERROR_CODES.staffConflict)),
      categorizeStaffWriteError(httpError(409, STAFF_ERROR_CODES.identityInactive)),
      categorizeStaffWriteError(httpError(422, STAFF_ERROR_CODES.invalid)),
      categorizeStaffWriteError(httpError(404, STAFF_ERROR_CODES.notFound)),
      categorizeStaffWriteError(httpError(409, STAFF_ERROR_CODES.idempotencyConflict)),
    ]);
    expect(categories.size).toBe(7);
  });
});

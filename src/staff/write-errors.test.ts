import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it } from "vitest";

import { classifyCommerceError } from "../commerce/errors";
import {
  categorizeStaffWriteError,
  describeStaffWriteError,
  PROVISIONAL_STAFF_ERROR_CODES,
} from "./write-errors";

function httpError(status: number, code: string) {
  return classifyCommerceError(new ApiHttpError("nope", status, code, "req-1"));
}

describe("categorizeStaffWriteError", () => {
  it("maps the anti-escalation code to a distinct, non-actionable category", () => {
    const error = httpError(403, PROVISIONAL_STAFF_ERROR_CODES.cannotDelegate);
    expect(categorizeStaffWriteError(error)).toBe("cannot-delegate");
    expect(describeStaffWriteError(error).recovery).toBe("none");
  });

  it("maps the last-admin code distinctly from a generic 403", () => {
    expect(categorizeStaffWriteError(httpError(403, PROVISIONAL_STAFF_ERROR_CODES.lastAdmin))).toBe(
      "last-admin",
    );
    // A generic 403 with no known code is a plain access denial, not last-admin.
    expect(categorizeStaffWriteError(httpError(403, "FORBIDDEN"))).toBe("denied");
  });

  it("distinguishes foreign-scope, protected-assignment and membership-exists", () => {
    expect(
      categorizeStaffWriteError(httpError(403, PROVISIONAL_STAFF_ERROR_CODES.foreignScope)),
    ).toBe("foreign-scope");
    expect(
      categorizeStaffWriteError(httpError(409, PROVISIONAL_STAFF_ERROR_CODES.protectedAssignment)),
    ).toBe("protected-assignment");
    expect(
      categorizeStaffWriteError(httpError(409, PROVISIONAL_STAFF_ERROR_CODES.membershipExists)),
    ).toBe("membership-exists");
  });

  it("maps identity-not-found to an editable recovery (choose again)", () => {
    const error = httpError(404, PROVISIONAL_STAFF_ERROR_CODES.identityNotFound);
    expect(categorizeStaffWriteError(error)).toBe("identity-not-found");
    expect(describeStaffWriteError(error).recovery).toBe("edit");
  });

  it("never hides an idempotency conflict — it is terminal", () => {
    const error = httpError(409, PROVISIONAL_STAFF_ERROR_CODES.conflict);
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

  it("keeps each category distinct rather than collapsing to one generic error", () => {
    const categories = new Set([
      categorizeStaffWriteError(httpError(403, PROVISIONAL_STAFF_ERROR_CODES.cannotDelegate)),
      categorizeStaffWriteError(httpError(403, PROVISIONAL_STAFF_ERROR_CODES.lastAdmin)),
      categorizeStaffWriteError(httpError(403, PROVISIONAL_STAFF_ERROR_CODES.foreignScope)),
      categorizeStaffWriteError(httpError(409, PROVISIONAL_STAFF_ERROR_CODES.protectedAssignment)),
      categorizeStaffWriteError(httpError(409, PROVISIONAL_STAFF_ERROR_CODES.membershipExists)),
    ]);
    expect(categories.size).toBe(5);
  });
});

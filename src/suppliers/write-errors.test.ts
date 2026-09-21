import { describe, expect, it } from "vitest";

import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";

import { classifyCommerceError } from "../commerce/errors";
import { describeSupplierWriteError } from "./write-errors";

function described(error: unknown) {
  return describeSupplierWriteError(classifyCommerceError(error));
}

describe("describeSupplierWriteError — typed error mapping", () => {
  it("maps a duplicate reference code to a correctable edit", () => {
    const result = described(new ApiHttpError("dup", 409, "SUPPLIER_CODE_CONFLICT", null));
    expect(result.heading).toBe("Reference code already in use");
    expect(result.recovery).toBe("edit");
  });

  it("maps an inactive supplier to a terminal (non-retry) rejection", () => {
    const result = described(new ApiHttpError("inactive", 409, "SUPPLIER_INACTIVE", null));
    expect(result.heading).toBe("Supplier is inactive");
    expect(result.recovery).toBe("none");
  });

  it("maps a not-found supplier", () => {
    const result = described(new ApiHttpError("gone", 404, "SUPPLIER_NOT_FOUND", null));
    expect(result.heading).toBe("Supplier not found");
    expect(result.recovery).toBe("none");
  });

  it("maps invalid supplier input to a correctable edit", () => {
    const result = described(new ApiHttpError("bad", 422, "INVALID_SUPPLIER", null));
    expect(result.recovery).toBe("edit");
  });

  it("never hides an idempotency conflict — it is terminal, not a silent retry", () => {
    const result = described(new ApiHttpError("conflict", 409, "IDEMPOTENCY_CONFLICT", null));
    expect(result.heading).toBe("Duplicate operation");
    expect(result.recovery).toBe("none");
  });

  it("maps a 403 to access denied regardless of code", () => {
    const result = described(new ApiHttpError("no", 403, "FORBIDDEN", null));
    expect(result.heading).toBe("Access denied");
    expect(result.recovery).toBe("none");
  });

  it("treats a network failure as an AMBIGUOUS outcome that reuses the key on retry", () => {
    const result = described(new ApiNetworkError("down"));
    expect(result.recovery).toBe("retry");
  });
});

import { ApiContractError, ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it } from "vitest";

import { classifyCommerceError } from "./errors";

const REQUEST_ID = "abcabcab-abca-4bca-8bca-abcabcabcabc";

describe("classifyCommerceError", () => {
  it("maps HTTP 401 to an authentication problem", () => {
    const result = classifyCommerceError(
      new ApiHttpError("nope", 401, "UNAUTHENTICATED", REQUEST_ID),
    );
    expect(result.kind).toBe("auth");
    expect(result.status).toBe(401);
  });

  it("maps HTTP 403 to a server-authorization denial (distinct from 401)", () => {
    const result = classifyCommerceError(new ApiHttpError("nope", 403, "FORBIDDEN", REQUEST_ID));
    expect(result.kind).toBe("forbidden");
  });

  it("maps HTTP 404 to a not-found error (distinct from server errors)", () => {
    const result = classifyCommerceError(new ApiHttpError("gone", 404, "NOT_FOUND", REQUEST_ID));
    expect(result.kind).toBe("not-found");
    expect(result.status).toBe(404);
  });

  it("maps 5xx to an unexpected server error", () => {
    const result = classifyCommerceError(new ApiHttpError("boom", 500, "INTERNAL", REQUEST_ID));
    expect(result.kind).toBe("server");
  });

  it("maps transport failures to a network error", () => {
    const result = classifyCommerceError(new ApiNetworkError("unreachable"));
    expect(result.kind).toBe("network");
  });

  it("maps contract violations to a contract error", () => {
    const result = classifyCommerceError(new ApiContractError("bad shape"));
    expect(result.kind).toBe("contract");
  });

  it("falls back to unknown for unexpected values", () => {
    expect(classifyCommerceError(new Error("weird")).kind).toBe("unknown");
  });
});

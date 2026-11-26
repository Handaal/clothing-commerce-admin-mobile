import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it } from "vitest";

import { describeSettingsError } from "./errors";

describe("Settings canonical error UX", () => {
  it.each([
    ["CURRENCY_LOCKED", "historical-lock"],
    ["IMMUTABLE_FIELD", "immutable"],
    ["DEVICE_CONFLICT", "device-conflict"],
    ["IDEMPOTENCY_CONFLICT", "idempotency-conflict"],
    ["SETTINGS_CODE_CONFLICT", "conflict"],
  ])("maps %s without exposing its backend code", (code, kind) => {
    const result = describeSettingsError(new ApiHttpError("raw backend detail", 409, code, null));
    expect(result.kind).toBe(kind);
    expect(`${result.heading} ${result.message}`).not.toContain(code);
    expect(`${result.heading} ${result.message}`).not.toContain("raw backend detail");
  });

  // Phase 2S-F2: operational-topology conflicts from the Settings write boundary. Each maps to a
  // distinct, actionable message and never leaks the backend code — matching the API codes closed in
  // the paired clothing-commerce-api release-blocker fixes.
  it.each([
    [
      "STOREFRONT_LOCATION_NOT_OPERATIONAL",
      "Storefront location not ready",
      /sellable and fulfillment-enabled/i,
    ],
    [
      "REGISTER_LOCATION_NOT_OPERATIONAL",
      "Register location not ready",
      /active branch and an active, fulfillment-enabled/i,
    ],
    [
      "STOREFRONT_DEPENDENCY_CONFLICT",
      "In use by an enabled storefront",
      /online store depends on/i,
    ],
    ["REGISTER_DEPENDENCY_CONFLICT", "In use by an active register", /active cash register uses/i],
  ])("maps topology conflict %s to distinct actionable guidance", (code, heading, messageMatch) => {
    const result = describeSettingsError(new ApiHttpError("raw backend detail", 409, code, null));
    expect(result.kind).toBe("topology-conflict");
    expect(result.heading).toBe(heading);
    expect(result.message).toMatch(messageMatch);
    expect(`${result.heading} ${result.message}`).not.toContain(code);
    expect(`${result.heading} ${result.message}`).not.toContain("raw backend detail");
  });

  it("maps forbidden, invalid relationships, network, and server failures", () => {
    expect(describeSettingsError(new ApiHttpError("raw", 403, "FORBIDDEN", null)).kind).toBe(
      "forbidden",
    );
    expect(
      describeSettingsError(new ApiHttpError("raw", 422, "INVALID_SETTINGS", null)),
    ).toMatchObject({
      kind: "validation",
      message: expect.stringContaining("same branch"),
    });
    expect(describeSettingsError(new ApiNetworkError("offline")).kind).toBe("network");
    expect(describeSettingsError(new ApiHttpError("raw", 500, "INTERNAL", null)).kind).toBe(
      "server",
    );
  });
});

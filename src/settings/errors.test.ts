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

  it("maps forbidden, invalid relationships, network, and server failures", () => {
    expect(describeSettingsError(new ApiHttpError("raw", 403, "FORBIDDEN", null)).kind).toBe(
      "forbidden",
    );
    expect(
      describeSettingsError(new ApiHttpError("raw", 422, "INVALID_SETTINGS", null)),
    ).toMatchObject({
      kind: "validation",
      message: expect.stringContaining("same Branch"),
    });
    expect(describeSettingsError(new ApiNetworkError("offline")).kind).toBe("network");
    expect(describeSettingsError(new ApiHttpError("raw", 500, "INTERNAL", null)).kind).toBe(
      "server",
    );
  });
});

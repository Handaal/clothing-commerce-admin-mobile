import { describe, expect, it } from "vitest";
import { meContext, TENANT_A } from "../test-support/fixtures";
import { settingsCapabilities } from "./capabilities";

describe("settingsCapabilities", () => {
  it("denies missing guidance", () =>
    expect(settingsCapabilities(meContext(TENANT_A))).toEqual({
      canRead: false,
      canManage: false,
    }));
  it("preserves independent read/manage guidance", () => {
    const context = meContext(TENANT_A);
    const withSettings = {
      ...context,
      access: { ...context.access, settings: { canRead: true, canManage: false } },
    };
    expect(settingsCapabilities(withSettings)).toEqual({ canRead: true, canManage: false });
    expect(
      settingsCapabilities({
        ...context,
        access: { ...context.access, settings: { canRead: false, canManage: true } },
      }),
    ).toEqual({ canRead: false, canManage: true });
  });
});

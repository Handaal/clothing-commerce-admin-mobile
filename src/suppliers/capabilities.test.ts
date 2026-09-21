import { describe, expect, it } from "vitest";

import { TENANT_A, meContext } from "../test-support/fixtures";
import { supplierCapabilities } from "./capabilities";

describe("supplierCapabilities", () => {
  it("reads canRead/canManage from the context access block", () => {
    const context = meContext(TENANT_A, { suppliers: { canRead: true, canManage: true } });
    expect(supplierCapabilities(context)).toEqual({ canRead: true, canManage: true });
  });

  it("reflects a read-only caller", () => {
    const context = meContext(TENANT_A, { suppliers: { canRead: true, canManage: false } });
    expect(supplierCapabilities(context)).toEqual({ canRead: true, canManage: false });
  });

  it("defaults both to false when the suppliers capability is absent (older server / no access)", () => {
    const context = meContext(TENANT_A, { suppliers: null });
    expect(supplierCapabilities(context)).toEqual({ canRead: false, canManage: false });
  });
});

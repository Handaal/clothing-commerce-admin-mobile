import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it } from "vitest";

import { TENANT_A, meContext } from "../test-support/fixtures";
import { staffCapabilities } from "./capabilities";

describe("staffCapabilities", () => {
  it("defaults both to false when the staff block is absent (older server / no access)", () => {
    const context = meContext(TENANT_A, { staff: null });
    expect(staffCapabilities(context)).toEqual({ canRead: false, canManage: false });
  });

  it("reads canRead / canManage from the structural staff block", () => {
    expect(
      staffCapabilities(meContext(TENANT_A, { staff: { canRead: true, canManage: false } })),
    ).toEqual({
      canRead: true,
      canManage: false,
    });
  });

  it("treats manage as implying read at the UI layer", () => {
    // A server that only sets canManage still yields a usable read affordance; the API re-authorizes.
    expect(
      staffCapabilities(meContext(TENANT_A, { staff: { canRead: false, canManage: true } })),
    ).toEqual({ canRead: true, canManage: true });
  });

  it("never throws on a context whose access has no staff field at all", () => {
    // Simulate a raw context missing the (not-yet-frozen) staff block entirely.
    const raw = {
      tenant: { id: TENANT_A, name: "Acme", status: "active" },
      membership: { id: "m1" },
      access: {
        catalog: { canRead: true, tenantWide: true, brands: [] },
        inventory: {
          canRead: false,
          tenantWide: false,
          locations: [],
          write: { canReceive: false, canAdjust: false, canTransfer: false, locations: [] },
        },
        orders: { canRead: true, tenantWide: false, brands: [], branches: [] },
      },
    } as unknown as MeContextResponse;
    expect(staffCapabilities(raw)).toEqual({ canRead: false, canManage: false });
  });
});

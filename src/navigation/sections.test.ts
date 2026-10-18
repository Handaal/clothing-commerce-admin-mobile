import { describe, expect, it } from "vitest";

import { meContext, TENANT_A } from "../test-support/fixtures";
import { managementSection, visibleManagementSections } from "./sections";

describe("management section registry", () => {
  it("shows only granted API-backed sections while retaining honest planned and reserved entries", () => {
    const context = meContext(TENANT_A, {
      inventory: { canRead: false },
      suppliers: null,
      staff: null,
      promotions: null,
    });

    expect(visibleManagementSections(context).map((section) => section.id)).toEqual([
      "dashboard",
      "products",
      "orders",
      "customers",
      "activity",
      "storefront",
    ]);
  });

  it("does not invent routes for domains without a canonical management API", () => {
    expect(managementSection("customers").status).toBe("planned");
    expect(managementSection("customers").route).toBeUndefined();
    expect(managementSection("activity").status).toBe("planned");
    expect(managementSection("activity").route).toBeUndefined();
    expect(managementSection("storefront")).toMatchObject({
      status: "reserved",
      route: "/storefront",
    });
  });
});

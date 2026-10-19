import { describe, expect, it } from "vitest";

import { meContext, TENANT_A } from "../test-support/fixtures";
import {
  activeSectionForPath,
  isPrimarySection,
  managementSection,
  PRIMARY_SECTION_IDS,
  visibleManagementSections,
} from "./sections";

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

describe("primary navigation routing", () => {
  it("treats exactly the bottom-tab sections as primary", () => {
    expect([...PRIMARY_SECTION_IDS]).toEqual(["dashboard", "orders", "inventory", "products"]);
    expect(isPrimarySection("orders")).toBe(true);
    expect(isPrimarySection("promotions")).toBe(false);
    expect(isPrimarySection("storefront")).toBe(false);
  });

  it("every primary section has a real route to derive the tab from", () => {
    for (const id of PRIMARY_SECTION_IDS) {
      expect(managementSection(id).route).toBeTruthy();
    }
  });

  it("resolves the owning primary tab from the current path, nested routes included", () => {
    expect(activeSectionForPath("/")).toBe("dashboard");
    expect(activeSectionForPath("/orders")).toBe("orders");
    expect(activeSectionForPath("/orders/abc-123")).toBe("orders");
    expect(activeSectionForPath("/products/p1/variants")).toBe("products");
    expect(activeSectionForPath("/inventory")).toBe("inventory");
  });

  it("routes any non-primary path (incl. the dashboard's Storefront card) to More", () => {
    expect(activeSectionForPath("/promotions")).toBe("more");
    expect(activeSectionForPath("/storefront")).toBe("more");
    expect(activeSectionForPath("/settings/branches/new")).toBe("more");
  });

  it("does not treat a prefix-colliding path as a primary section", () => {
    // "/orders-archive" shares a string prefix with "/orders" but is a distinct path.
    expect(activeSectionForPath("/orders-archive")).toBe("more");
  });
});

import { describe, expect, it } from "vitest";

import {
  describeSupplierStatus,
  statusFilterLabel,
  supplierStatusLabel,
  supplierStatusToggle,
} from "./status";

describe("supplier status presentation", () => {
  it("labels active and inactive", () => {
    expect(supplierStatusLabel("active")).toBe("Active");
    expect(supplierStatusLabel("inactive")).toBe("Inactive");
  });

  it("describes inactive as retained, never deleted", () => {
    expect(describeSupplierStatus("inactive")).toMatch(/not deleted/i);
    expect(describeSupplierStatus("inactive")).toMatch(/history/i);
  });

  it("toggles to the opposite status with a confirmation label", () => {
    expect(supplierStatusToggle("active")).toEqual({
      next: "inactive",
      label: "Mark inactive",
      confirmLabel: "Confirm mark inactive",
    });
    expect(supplierStatusToggle("inactive")).toEqual({
      next: "active",
      label: "Mark active",
      confirmLabel: "Confirm mark active",
    });
  });

  it("labels the status filters", () => {
    expect(statusFilterLabel("all")).toBe("All");
    expect(statusFilterLabel("active")).toBe("Active");
    expect(statusFilterLabel("inactive")).toBe("Inactive");
  });
});

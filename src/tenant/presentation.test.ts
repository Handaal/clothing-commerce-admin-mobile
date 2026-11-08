import { describe, expect, it } from "vitest";

import { tenantDisplayName } from "./presentation";

describe("tenant presentation name", () => {
  it("uses the configured client name for the local development tenant", () => {
    expect(tenantDisplayName("Dev Local", "Zee Store")).toBe("Zee Store");
    expect(tenantDisplayName("dev-local", "Zee Store")).toBe("Zee Store");
  });

  it("defaults the local development tenant to the first client preview", () => {
    expect(tenantDisplayName("Dev Local")).toBe("Zee Store");
  });

  it("never renames real tenants or invents a name without preview configuration", () => {
    expect(tenantDisplayName("Acme", "Zee Store")).toBe("Acme");
    expect(tenantDisplayName("Dev Local", "  ")).toBe("Dev Local");
  });
});

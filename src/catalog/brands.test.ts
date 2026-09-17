import { describe, expect, it } from "vitest";

import { brandNameMap, resolveBrandContext, type CatalogAccess } from "./brands";

function catalog(brands: { id: string; name: string }[]): CatalogAccess {
  return { canRead: true, tenantWide: false, brands };
}

describe("resolveBrandContext", () => {
  it("reports none when no brand is accessible", () => {
    expect(resolveBrandContext(catalog([]))).toEqual({ kind: "none" });
  });

  it("uses the single brand directly (no switcher)", () => {
    const result = resolveBrandContext(catalog([{ id: "b1", name: "Flagship" }]));
    expect(result).toEqual({ kind: "single", brand: { id: "b1", name: "Flagship" } });
  });

  it("requires explicit selection for multiple brands", () => {
    const result = resolveBrandContext(
      catalog([
        { id: "b1", name: "Flagship" },
        { id: "b2", name: "Outlet" },
      ]),
    );
    expect(result.kind).toBe("multi");
    if (result.kind === "multi") expect(result.brands).toHaveLength(2);
  });
});

describe("brandNameMap", () => {
  it("maps ids to names", () => {
    const map = brandNameMap(catalog([{ id: "b1", name: "Flagship" }]));
    expect(map.get("b1")).toBe("Flagship");
    expect(map.get("missing")).toBeUndefined();
  });
});

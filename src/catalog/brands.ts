import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

export type CatalogAccess = MeContextResponse["access"]["catalog"];
export type CatalogBrand = CatalogAccess["brands"][number];

/**
 * Brand context for catalog authoring, honouring the frozen single/multi-brand invariant:
 * - a single-brand tenant is NEVER forced through a brand switcher — the one brand is used directly;
 * - a genuinely multi-brand tenant must pick an explicit brand for a new product;
 * - with no accessible brand we cannot author (and never guess a brand id).
 */
export type BrandContext =
  | { kind: "none" }
  | { kind: "single"; brand: CatalogBrand }
  | { kind: "multi"; brands: CatalogBrand[] };

export function resolveBrandContext(catalog: CatalogAccess): BrandContext {
  const brands = catalog.brands;
  if (brands.length === 0) return { kind: "none" };
  if (brands.length === 1) return { kind: "single", brand: brands[0] };
  return { kind: "multi", brands };
}

/** A lookup from brand id to display name, for list/detail summaries. */
export function brandNameMap(catalog: CatalogAccess): Map<string, string> {
  return new Map(catalog.brands.map((brand) => [brand.id, brand.name]));
}

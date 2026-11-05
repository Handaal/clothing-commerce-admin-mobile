import { useSyncExternalStore } from "react";

import type { StorefrontStatus } from "@shifted/clothing-commerce-sdk";

import { t } from "../i18n";
import type { ProductStatus } from "./operations";

/**
 * Session-scoped observations about a product that the authenticated read surface does NOT return.
 *
 * `GET /products/{id}` (SDK `getProduct`) intentionally returns only id/name/styleCode/status, its
 * variants, options and prices. It does NOT return the Storefront publication state, the slug, or the
 * description. Those become known only from a write response this session — `createProduct` and
 * `setProductStatus` return `storefrontStatus`; `publishProduct`/`unpublishProduct` return it (and
 * `publishedAt`); and we know the slug/description we ourselves just sent.
 *
 * This is the same deliberate, contract-faithful pattern the inventory slice uses for `observedVersion`:
 * the server stays authoritative, and we surface publication state as "observed this session" rather
 * than inventing a value the read contract never provides. When nothing has been observed, the UI says
 * so instead of guessing "unpublished".
 */
export interface ProductObservation {
  storefrontStatus?: StorefrontStatus;
  publishedAt?: string | null;
  /** The internal lifecycle status last confirmed by a write (may lag the fresh read). */
  status?: ProductStatus;
  /** The slug we last sent on create/update — the only in-app source of the storefront slug. */
  slug?: string;
}

export interface CatalogObservationStore {
  get(productId: string): ProductObservation | undefined;
  record(productId: string, patch: ProductObservation): void;
  subscribe(listener: () => void): () => void;
  /** Snapshot identity that changes whenever any observation is recorded (for useSyncExternalStore). */
  version(): number;
}

export function createObservationStore(): CatalogObservationStore {
  const map = new Map<string, ProductObservation>();
  const listeners = new Set<() => void>();
  let version = 0;

  return {
    get(productId) {
      return map.get(productId);
    },
    record(productId, patch) {
      const prev = map.get(productId) ?? {};
      // Only overwrite keys that are actually present in the patch, so a publish that reports no slug
      // does not erase a slug observed at create time.
      const next: ProductObservation = { ...prev };
      if (patch.storefrontStatus !== undefined) next.storefrontStatus = patch.storefrontStatus;
      if (patch.publishedAt !== undefined) next.publishedAt = patch.publishedAt;
      if (patch.status !== undefined) next.status = patch.status;
      if (patch.slug !== undefined) next.slug = patch.slug;
      map.set(productId, next);
      version += 1;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version() {
      return version;
    },
  };
}

/** App-lifetime default store. Screens may inject their own for isolation/testing. */
export const catalogObservations: CatalogObservationStore = createObservationStore();

/** Subscribe a component to a single product's session observation. */
export function useProductObservation(
  productId: string,
  store: CatalogObservationStore = catalogObservations,
): ProductObservation | undefined {
  // The stored observation object is referentially stable between records (each `record` writes a new
  // object), so returning it directly is a valid, loop-free snapshot for useSyncExternalStore.
  return useSyncExternalStore(
    store.subscribe,
    () => store.get(productId),
    () => store.get(productId),
  );
}

/** Human summary of a product's Storefront publication state for list/detail display. */
export function describePublication(observation: ProductObservation | undefined): string {
  if (!observation || observation.storefrontStatus === undefined) {
    return t("publication.notObserved");
  }
  return observation.storefrontStatus === "published"
    ? t("publication.published")
    : t("publication.notPublished");
}

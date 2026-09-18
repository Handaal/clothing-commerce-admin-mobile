import { describe, expect, it, vi } from "vitest";

import { createObservationStore, describePublication } from "./observations";

describe("catalog observation store", () => {
  it("records and reads a product observation", () => {
    const store = createObservationStore();
    expect(store.get("p1")).toBeUndefined();
    store.record("p1", { storefrontStatus: "published", slug: "tee", publishedAt: "2026-09-17" });
    expect(store.get("p1")).toEqual({
      storefrontStatus: "published",
      slug: "tee",
      publishedAt: "2026-09-17",
    });
  });

  it("merges patches without erasing previously observed fields", () => {
    const store = createObservationStore();
    store.record("p1", { slug: "tee", storefrontStatus: "unpublished" });
    // A later publish reports status but not the slug — slug must survive.
    store.record("p1", { storefrontStatus: "published", publishedAt: "2026-09-17" });
    expect(store.get("p1")).toEqual({
      slug: "tee",
      storefrontStatus: "published",
      publishedAt: "2026-09-17",
    });
  });

  it("notifies subscribers and bumps the version on record", () => {
    const store = createObservationStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(store.version()).toBe(0);
    store.record("p1", { storefrontStatus: "published" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
    unsubscribe();
    store.record("p1", { storefrontStatus: "unpublished" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns a stable reference between records (loop-safe snapshot)", () => {
    const store = createObservationStore();
    store.record("p1", { storefrontStatus: "published" });
    expect(store.get("p1")).toBe(store.get("p1"));
  });
});

describe("describePublication", () => {
  it("distinguishes observed published, unpublished, and not-yet-observed", () => {
    expect(describePublication(undefined)).toMatch(/not observed/i);
    expect(describePublication({})).toMatch(/not observed/i);
    expect(describePublication({ storefrontStatus: "published" })).toMatch(/Published/);
    expect(describePublication({ storefrontStatus: "unpublished" })).toMatch(/Not published/);
  });
});

import { describe, expect, it, vi } from "vitest";

import { collectAllPages, DEFAULT_MAX_PAGES, type CursorPage } from "./pagination";

function page<T>(items: T[], over: Partial<CursorPage<T>["pageInfo"]> = {}): CursorPage<T> {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...over } };
}

describe("collectAllPages", () => {
  it("returns a single page and passes undefined as the first cursor", async () => {
    const fetchPage = vi.fn(async () => page([1, 2, 3]));

    const items = await collectAllPages(fetchPage);

    expect(items).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(undefined);
  });

  it("follows the cursor across pages and accumulates in server order", async () => {
    const fetchPage = vi
      .fn<(cursor: string | undefined) => Promise<CursorPage<number>>>()
      .mockResolvedValueOnce(page([1], { hasMore: true, nextCursor: "c1" }))
      .mockResolvedValueOnce(page([2], { hasMore: true, nextCursor: "c2" }))
      .mockResolvedValueOnce(page([3], { hasMore: false, nextCursor: null }));

    const items = await collectAllPages(fetchPage);

    expect(items).toEqual([1, 2, 3]);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([undefined, "c1", "c2"]);
  });

  it("stops when hasMore is false even if a stray nextCursor is present", async () => {
    const fetchPage = vi.fn(async () => page([1], { hasMore: false, nextCursor: "ignored" }));

    const items = await collectAllPages(fetchPage);

    expect(items).toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("propagates a failure during continuation (no partial swallow)", async () => {
    const fetchPage = vi
      .fn<(cursor: string | undefined) => Promise<CursorPage<number>>>()
      .mockResolvedValueOnce(page([1], { hasMore: true, nextCursor: "c1" }))
      .mockRejectedValueOnce(new Error("boom"));

    await expect(collectAllPages(fetchPage)).rejects.toThrow("boom");
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("is bounded: a server that never stops cannot loop forever", async () => {
    const fetchPage = vi.fn(async () => page([1], { hasMore: true, nextCursor: "always" }));

    const items = await collectAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(DEFAULT_MAX_PAGES);
    expect(items).toHaveLength(DEFAULT_MAX_PAGES);
  });

  it("honours a custom, smaller page bound", async () => {
    const fetchPage = vi.fn(async () => page([1], { hasMore: true, nextCursor: "always" }));

    await collectAllPages(fetchPage, 3);

    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});

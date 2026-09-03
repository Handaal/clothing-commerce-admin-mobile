import { describe, expect, it, vi } from "vitest";

import {
  collectAllPages,
  DEFAULT_MAX_PAGES,
  PaginationCapExceededError,
  type CursorPage,
} from "./pagination";

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

  it("completes normally when the last permitted page reports hasMore=false", async () => {
    // Exactly `maxPages` pages are needed and the final one terminates: this is a complete result.
    const fetchPage = vi
      .fn<(cursor: string | undefined) => Promise<CursorPage<number>>>()
      .mockImplementation(async (cursor) =>
        cursor === "last" ? page([2]) : page([1], { hasMore: true, nextCursor: "last" }),
      );

    const items = await collectAllPages(fetchPage, 2);

    expect(items).toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("is bounded AND fails closed: cap reached while hasMore=true rejects (never truncated success)", async () => {
    const fetchPage = vi.fn(async () => page([1], { hasMore: true, nextCursor: "always" }));

    await expect(collectAllPages(fetchPage)).rejects.toBeInstanceOf(PaginationCapExceededError);
    // Still bounded: it stopped at exactly the cap rather than looping forever.
    expect(fetchPage).toHaveBeenCalledTimes(DEFAULT_MAX_PAGES);
  });

  it("fails closed on a custom, smaller page bound too", async () => {
    const fetchPage = vi.fn(async () => page([1], { hasMore: true, nextCursor: "always" }));

    await expect(collectAllPages(fetchPage, 3)).rejects.toBeInstanceOf(PaginationCapExceededError);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});

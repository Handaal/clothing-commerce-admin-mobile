import type { ReturnHistoryResponse } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it, vi } from "vitest";

import { PaginationCapExceededError } from "../commerce/pagination";
import { ORDER_A, RETURN_A, RETURN_B, returnDetail, returnHistory } from "../test-support/fixtures";
import { MAX_RETURNS_PAGES, loadAllReturns } from "./load";

const CURSOR = "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6";

type ListReturns = (orderId: string, query?: { cursor?: string }) => Promise<ReturnHistoryResponse>;

describe("loadAllReturns", () => {
  it("returns a single page and issues one request with no cursor", async () => {
    const listReturns = vi
      .fn<ListReturns>()
      .mockResolvedValue(returnHistory([returnDetail({ id: RETURN_A })]));

    const items = await loadAllReturns({ listReturns }, ORDER_A);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(RETURN_A);
    expect(listReturns).toHaveBeenCalledTimes(1);
    expect(listReturns.mock.calls[0]).toEqual([ORDER_A, {}]);
  });

  it("follows the cursor across pages and accumulates in server order", async () => {
    const listReturns = vi
      .fn<ListReturns>()
      .mockResolvedValueOnce(
        returnHistory([returnDetail({ id: RETURN_A })], { hasMore: true, nextCursor: CURSOR }),
      )
      .mockResolvedValueOnce(
        returnHistory([returnDetail({ id: RETURN_B })], { hasMore: false, nextCursor: null }),
      );

    const items = await loadAllReturns({ listReturns }, ORDER_A);

    expect(items.map((r) => r.id)).toEqual([RETURN_A, RETURN_B]);
    expect(listReturns).toHaveBeenCalledTimes(2);
    expect(listReturns.mock.calls[1]).toEqual([ORDER_A, { cursor: CURSOR }]);
  });

  it("fails closed at the page cap rather than returning a truncated history", async () => {
    const listReturns = vi
      .fn<ListReturns>()
      .mockResolvedValue(returnHistory([returnDetail()], { hasMore: true, nextCursor: CURSOR }));

    await expect(loadAllReturns({ listReturns }, ORDER_A)).rejects.toBeInstanceOf(
      PaginationCapExceededError,
    );
    expect(listReturns).toHaveBeenCalledTimes(MAX_RETURNS_PAGES);
  });
});

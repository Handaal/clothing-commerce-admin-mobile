import type { OrderListQuery, OrderListResponse } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it, vi } from "vitest";

import { ORDER_A, ORDER_B, orderList, orderListItem } from "../test-support/fixtures";
import { MAX_ORDERS_PAGES, loadAllOrders } from "./load";

describe("loadAllOrders", () => {
  it("returns a single page and issues exactly one request with no cursor", async () => {
    const listOrders = vi
      .fn<(query?: OrderListQuery) => Promise<OrderListResponse>>()
      .mockResolvedValue(orderList([orderListItem({ id: ORDER_A })]));

    const items = await loadAllOrders({ listOrders });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(ORDER_A);
    expect(listOrders).toHaveBeenCalledTimes(1);
    expect(listOrders.mock.calls[0][0]).toEqual({ cursor: undefined });
  });

  it("follows the cursor across pages and accumulates in order", async () => {
    const listOrders = vi
      .fn<(query?: OrderListQuery) => Promise<OrderListResponse>>()
      .mockResolvedValueOnce(
        orderList([orderListItem({ id: ORDER_A, orderNumber: "ORD-1" })], {
          hasMore: true,
          nextCursor: "cursor-1",
        }),
      )
      .mockResolvedValueOnce(
        orderList([orderListItem({ id: ORDER_B, orderNumber: "ORD-2" })], {
          hasMore: false,
          nextCursor: null,
        }),
      );

    const items = await loadAllOrders({ listOrders });

    expect(items.map((o) => o.id)).toEqual([ORDER_A, ORDER_B]);
    expect(listOrders).toHaveBeenCalledTimes(2);
    expect(listOrders.mock.calls[1][0]).toEqual({ cursor: "cursor-1" });
  });

  it("propagates a failure during continuation", async () => {
    const listOrders = vi
      .fn<(query?: OrderListQuery) => Promise<OrderListResponse>>()
      .mockResolvedValueOnce(
        orderList([orderListItem()], { hasMore: true, nextCursor: "cursor-1" }),
      )
      .mockRejectedValueOnce(new Error("boom"));

    await expect(loadAllOrders({ listOrders })).rejects.toThrow("boom");
    expect(listOrders).toHaveBeenCalledTimes(2);
  });

  it("is bounded by MAX_ORDERS_PAGES", async () => {
    const listOrders = vi.fn(async () =>
      orderList([orderListItem()], { hasMore: true, nextCursor: "always" }),
    );

    const items = await loadAllOrders({ listOrders });

    expect(listOrders).toHaveBeenCalledTimes(MAX_ORDERS_PAGES);
    expect(items).toHaveLength(MAX_ORDERS_PAGES);
  });
});

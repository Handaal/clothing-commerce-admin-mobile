// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import type { OrderDetailResponse } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused" }));

import { ORDER_A, VARIANT_A, VARIANT_B, orderDetail } from "../test-support/fixtures";
import { OrderOperations, remainingByLine } from "./OrderOperations";

afterEach(() => cleanup());

/** An online order with line 1 (qty 3) and line 2 (qty 2), shipped as given. */
function order(
  shipped: [number, number],
  status: "placed" | "cancelled" = "placed",
): OrderDetailResponse {
  const base = orderDetail();
  const lineStatus = (done: number, qty: number) =>
    done === 0 ? "unfulfilled" : done === qty ? "fulfilled" : "partially_fulfilled";
  const total = shipped[0] + shipped[1];
  return {
    ...base,
    header: { ...base.header, status },
    fulfillmentProgress: {
      status: total === 0 ? "unfulfilled" : total === 5 ? "fulfilled" : "partially_fulfilled",
      lines: [
        {
          lineNumber: 1,
          variantId: VARIANT_A,
          orderedQuantity: 3,
          fulfilledQuantity: shipped[0],
          status: lineStatus(shipped[0], 3),
        },
        {
          lineNumber: 2,
          variantId: VARIANT_B,
          orderedQuantity: 2,
          fulfilledQuantity: shipped[1],
          status: lineStatus(shipped[1], 2),
        },
      ],
    },
  };
}

/** The same order paid cash on delivery, with the payment in the given state. */
function cod(
  data: OrderDetailResponse,
  status: "pending" | "captured" = "pending",
): OrderDetailResponse {
  return {
    ...data,
    commerce: {
      customerId: null,
      customer: null,
      delivery: null,
      reservations: [],
      payment: {
        method: "cash_on_delivery",
        provider: null,
        status,
        amountMinor: data.header.totalMinor,
        currency: data.header.currency,
        capturedAt: status === "captured" ? "2026-11-26T10:00:00.000Z" : null,
      },
    },
  } as OrderDetailResponse;
}

function setup(
  data: OrderDetailResponse,
  options: { canFulfill?: boolean; canCancel?: boolean; canCollect?: boolean } = {},
  client = {
    fulfillOrder: vi.fn().mockResolvedValue(order([3, 2])),
    cancelOrder: vi.fn().mockResolvedValue(order([0, 0], "cancelled")),
    collectOrderPayment: vi.fn().mockResolvedValue(cod(order([3, 2]), "captured")),
  },
) {
  const onUpdated = vi.fn();
  const onReload = vi.fn();
  let n = 0;
  const newKey = vi.fn(() => `key-${++n}`);
  render(
    <OrderOperations
      data={data}
      client={client}
      canFulfill={options.canFulfill ?? true}
      canCancel={options.canCancel ?? true}
      canCollect={options.canCollect ?? false}
      onUpdated={onUpdated}
      onReload={onReload}
      newKey={newKey}
    />,
  );
  return { client, onUpdated, onReload, newKey };
}

function confirm(dialog: string) {
  fireEvent.click(screen.getByTestId(`${dialog}-confirm`));
}

describe("remainingByLine", () => {
  it("counts only what is left to ship", () => {
    expect([...remainingByLine(order([3, 1]))]).toEqual([[2, 1]]);
    expect(remainingByLine(order([3, 2])).size).toBe(0);
  });
});

describe("OrderOperations", () => {
  it("fulfils everything left with explicit lines and hands back the new detail", async () => {
    const { client, onUpdated } = setup(order([0, 0]));
    expect(screen.getByTestId("order-fulfil").textContent).toContain("Mark as fulfilled");
    fireEvent.click(screen.getByTestId("order-fulfil"));
    confirm("order-fulfil-dialog");
    await waitFor(() =>
      expect(client.fulfillOrder).toHaveBeenCalledWith({
        orderId: ORDER_A,
        idempotencyKey: "key-1",
        lines: [
          { lineNumber: 1, quantity: 3 },
          { lineNumber: 2, quantity: 2 },
        ],
      }),
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(order([3, 2])));
  });

  it("ships a partial quantity and blocks a quantity above what is left", async () => {
    const { client } = setup(order([0, 0]));
    fireEvent.change(screen.getByTestId("order-ship-1"), { target: { value: "4" } });
    expect(screen.getByTestId("order-ship-1-error")).toBeTruthy();
    fireEvent.click(screen.getByTestId("order-fulfil"));
    expect(screen.queryByTestId("order-fulfil-dialog")).toBeNull();

    fireEvent.change(screen.getByTestId("order-ship-1"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("order-ship-2"), { target: { value: "0" } });
    expect(screen.getByTestId("order-fulfil").textContent).toContain("Fulfil 1 items");
    fireEvent.click(screen.getByTestId("order-fulfil"));
    confirm("order-fulfil-dialog");
    await waitFor(() =>
      expect(client.fulfillOrder).toHaveBeenCalledWith(
        expect.objectContaining({ lines: [{ lineNumber: 1, quantity: 1 }] }),
      ),
    );
  });

  it("retries an ambiguous network failure with the SAME idempotency key", async () => {
    const client = {
      fulfillOrder: vi
        .fn()
        .mockRejectedValueOnce(new ApiNetworkError("offline"))
        .mockResolvedValueOnce(order([3, 2])),
      cancelOrder: vi.fn(),
      collectOrderPayment: vi.fn(),
    };
    setup(order([0, 0]), {}, client);
    fireEvent.click(screen.getByTestId("order-fulfil"));
    confirm("order-fulfil-dialog");
    fireEvent.click(await screen.findByTestId("order-ops-retry"));
    await waitFor(() => expect(client.fulfillOrder).toHaveBeenCalledTimes(2));
    expect(client.fulfillOrder.mock.calls[1]![0].idempotencyKey).toBe(
      client.fulfillOrder.mock.calls[0]![0].idempotencyKey,
    );
  });

  it("explains a definitive refusal and offers a reload when the order moved", async () => {
    const client = {
      fulfillOrder: vi.fn().mockRejectedValue(new ApiHttpError("x", 409, "OVER_FULFILLMENT", null)),
      cancelOrder: vi.fn(),
      collectOrderPayment: vi.fn(),
    };
    const { onReload } = setup(order([0, 0]), {}, client);
    fireEvent.click(screen.getByTestId("order-fulfil"));
    confirm("order-fulfil-dialog");
    expect((await screen.findByTestId("order-ops-error")).textContent).toContain(
      "more than is left to ship",
    );
    expect(screen.queryByTestId("order-ops-retry")).toBeNull();
    fireEvent.click(screen.getByTestId("order-ops-reload"));
    expect(onReload).toHaveBeenCalled();
  });

  it("cancels an unshipped order with its reason", async () => {
    const { client, onUpdated } = setup(order([0, 0]));
    fireEvent.change(screen.getByTestId("order-cancel-reason"), {
      target: { value: "Customer changed mind" },
    });
    fireEvent.click(screen.getByTestId("order-cancel"));
    confirm("order-cancel-dialog");
    await waitFor(() =>
      expect(client.cancelOrder).toHaveBeenCalledWith({
        orderId: ORDER_A,
        idempotencyKey: "key-1",
        reason: "Customer changed mind",
      }),
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it("offers cancel only while nothing has shipped, and fulfil only while something is left", () => {
    setup(order([1, 0]));
    expect(screen.getByTestId("order-fulfil")).toBeTruthy();
    expect(screen.queryByTestId("order-cancel")).toBeNull();
    cleanup();
    setup(order([3, 2]));
    expect(screen.queryByTestId("order-operations")).toBeNull();
    cleanup();
    setup(order([0, 0], "cancelled"));
    expect(screen.queryByTestId("order-operations")).toBeNull();
  });

  it("follows the grants and never shows actions on POS orders", () => {
    setup(order([0, 0]), { canFulfill: false, canCancel: true });
    expect(screen.queryByTestId("order-fulfil")).toBeNull();
    expect(screen.getByTestId("order-cancel")).toBeTruthy();
    cleanup();
    setup(order([0, 0]), { canFulfill: false, canCancel: false });
    expect(screen.queryByTestId("order-operations")).toBeNull();
    cleanup();
    const pos = order([0, 0]);
    setup({ ...pos, header: { ...pos.header, channel: "pos" } });
    expect(screen.queryByTestId("order-operations")).toBeNull();
  });
});

describe("OrderOperations — delivered + cash collected (SDK 0.54)", () => {
  it("records the courier's cash once everything has shipped, with one key", async () => {
    const { client, onUpdated } = setup(cod(order([3, 2])), { canCollect: true });
    expect(screen.queryByTestId("order-fulfil")).toBeNull();
    fireEvent.click(screen.getByTestId("order-collect"));
    confirm("order-collect-dialog");
    await waitFor(() =>
      expect(client.collectOrderPayment).toHaveBeenCalledWith({
        orderId: ORDER_A,
        idempotencyKey: "key-1",
      }),
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(cod(order([3, 2]), "captured")));
  });

  it("is offered only when fully shipped, still unpaid, and granted", () => {
    setup(cod(order([3, 1])), { canCollect: true });
    expect(screen.queryByTestId("order-collect")).toBeNull();
    cleanup();
    setup(cod(order([3, 2]), "captured"), { canCollect: true });
    expect(screen.queryByTestId("order-operations")).toBeNull();
    cleanup();
    setup(cod(order([3, 2])), { canCollect: false });
    expect(screen.queryByTestId("order-operations")).toBeNull();
  });

  it("explains a not-fully-shipped refusal and offers a reload", async () => {
    const client = {
      fulfillOrder: vi.fn(),
      cancelOrder: vi.fn(),
      collectOrderPayment: vi
        .fn()
        .mockRejectedValue(new ApiHttpError("x", 409, "ORDER_NOT_FULLY_SHIPPED", null)),
    };
    setup(cod(order([3, 2])), { canCollect: true }, client);
    fireEvent.click(screen.getByTestId("order-collect"));
    confirm("order-collect-dialog");
    expect((await screen.findByTestId("order-ops-error")).textContent).toContain(
      "Ship every item before marking the order delivered.",
    );
    expect(screen.getByTestId("order-ops-reload")).toBeTruthy();
  });
});

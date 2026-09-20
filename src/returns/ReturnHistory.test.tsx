// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import type { ReturnHistoryResponse } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ORDER_A, RETURN_A, RETURN_B, returnDetail, returnHistory } from "../test-support/fixtures";
import { ReturnHistory } from "./ReturnHistory";

type ListReturns = (orderId: string, query?: { cursor?: string }) => Promise<ReturnHistoryResponse>;

afterEach(() => cleanup());

describe("ReturnHistory", () => {
  it("renders an empty state without fabricating returns", async () => {
    const listReturns = vi.fn<ListReturns>().mockResolvedValue(returnHistory([]));
    render(<ReturnHistory client={{ listReturns }} orderId={ORDER_A} />);
    expect(
      await screen.findByText("No returns have been recorded against this order."),
    ).toBeTruthy();
  });

  it("renders each return with channel, exact refund state and disposition", async () => {
    const listReturns = vi.fn<ListReturns>().mockResolvedValue(
      returnHistory([
        returnDetail({ id: RETURN_A }),
        returnDetail({
          id: RETURN_B,
          channel: "online",
          refund: { ...returnDetail().refund, status: "pending" },
          lines: [{ ...returnDetail().lines[0], disposition: "non_restock" }],
        }),
      ]),
    );
    render(<ReturnHistory client={{ listReturns }} orderId={ORDER_A} />);

    await screen.findByTestId("return-row-0");
    expect(screen.getByTestId("return-refund-status-0").textContent).toBe("Refund succeeded");
    expect(screen.getByTestId("return-refund-status-1").textContent).toBe("Refund pending");
    expect(screen.getByText("ONLINE")).toBeTruthy();
    expect(screen.getByText("Write-off")).toBeTruthy();
  });

  it("navigates to a return when a row is tapped and a handler is provided", async () => {
    const listReturns = vi
      .fn<ListReturns>()
      .mockResolvedValue(returnHistory([returnDetail({ id: RETURN_A })]));
    const onOpenReturn = vi.fn();
    render(
      <ReturnHistory client={{ listReturns }} orderId={ORDER_A} onOpenReturn={onOpenReturn} />,
    );
    fireEvent.click(await screen.findByTestId("return-row-0"));
    expect(onOpenReturn).toHaveBeenCalledWith(RETURN_A);
  });

  it("reports a return-scope denial distinctly (no retry)", async () => {
    const listReturns = vi
      .fn<ListReturns>()
      .mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    render(<ReturnHistory client={{ listReturns }} orderId={ORDER_A} />);
    expect(await screen.findByText("You do not have access to this order's returns.")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("offers a retry on a transient failure", async () => {
    const listReturns = vi
      .fn<ListReturns>()
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(returnHistory([returnDetail({ id: RETURN_A })]));
    render(<ReturnHistory client={{ listReturns }} orderId={ORDER_A} />);
    fireEvent.click(await screen.findByText("Try again"));
    await screen.findByTestId("return-row-0");
    expect(listReturns).toHaveBeenCalledTimes(2);
  });
});

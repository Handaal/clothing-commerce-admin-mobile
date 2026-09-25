// @vitest-environment jsdom
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PROMOTION_A, promotionSummary } from "../test-support/fixtures";
import type { PromotionClient } from "./client";
import { PromotionsListScreen } from "./PromotionsListScreen";

afterEach(() => cleanup());
const noop = () => {};

function client(
  listPromotions: PromotionClient["listPromotions"],
): Pick<PromotionClient, "listPromotions"> {
  return { listPromotions };
}

describe("PromotionsListScreen", () => {
  it("renders the Promotion list and opens a detail", async () => {
    const onOpen = vi.fn();
    render(
      <PromotionsListScreen
        client={client(async () => ({ total: 1, items: [promotionSummary()] }))}
        canRead
        canManage
        onOpenPromotion={onOpen}
        onCreatePromotion={noop}
        onBack={noop}
      />,
    );
    expect(await screen.findByText("Autumn offer")).toBeTruthy();
    expect(screen.getByText(/2 redeemed · 8 remaining/)).toBeTruthy();
    fireEvent.click(screen.getByTestId(`promotion-row-${PROMOTION_A}`));
    expect(onOpen).toHaveBeenCalledWith(PROMOTION_A);
  });

  it("keeps list/read available but hides create for read-only callers", async () => {
    render(
      <PromotionsListScreen
        client={client(async () => ({ total: 1, items: [promotionSummary()] }))}
        canRead
        canManage={false}
        onOpenPromotion={noop}
        onCreatePromotion={noop}
        onBack={noop}
      />,
    );
    await screen.findByText("Autumn offer");
    expect(screen.getByTestId("promotions-read-only")).toBeTruthy();
    expect(screen.queryByTestId("create-promotion")).toBeNull();
  });

  it("surfaces a server permission denial instead of a fake empty list", async () => {
    render(
      <PromotionsListScreen
        client={client(async () => {
          throw new ApiHttpError("denied", 403, "FORBIDDEN", null);
        })}
        canRead
        canManage={false}
        onOpenPromotion={noop}
        onCreatePromotion={noop}
        onBack={noop}
      />,
    );
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByTestId("promotions-empty")).toBeNull();
  });
});

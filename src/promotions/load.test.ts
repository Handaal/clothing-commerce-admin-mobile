import { describe, expect, it, vi } from "vitest";

import { promotionSummary } from "../test-support/fixtures";
import { loadAllPromotions } from "./load";

describe("loadAllPromotions", () => {
  it("follows offset pages until the server-reported total is complete", async () => {
    const first = promotionSummary();
    const second = promotionSummary({ id: "28282828-2828-4828-8828-282828282828", name: "Second" });
    const listPromotions = vi
      .fn()
      .mockResolvedValueOnce({ total: 2, items: [first] })
      .mockResolvedValueOnce({ total: 2, items: [second] });
    await expect(loadAllPromotions({ listPromotions })).resolves.toEqual([first, second]);
    expect(listPromotions.mock.calls.map(([query]) => query.offset)).toEqual([0, 1]);
  });
});

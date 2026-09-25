import { describe, expect, it } from "vitest";

import { describePromotionWriteError } from "./write-errors";

describe("describePromotionWriteError", () => {
  it("guides a used Promotion toward deactivate-and-replace", () => {
    expect(
      describePromotionWriteError({
        kind: "server",
        message: "hidden",
        status: 409,
        code: "PROMOTION_ECONOMICS_LOCKED",
      }),
    ).toEqual(expect.objectContaining({ heading: "Promotion already used", recovery: "replace" }));
  });

  it("maps validation, duplicate code, permission, conflict and network distinctly", () => {
    expect(
      describePromotionWriteError({ kind: "server", message: "", code: "INVALID_PROMOTION" })
        .recovery,
    ).toBe("edit");
    expect(
      describePromotionWriteError({ kind: "server", message: "", code: "PROMOTION_CODE_CONFLICT" })
        .heading,
    ).toBe("Code already in use");
    expect(describePromotionWriteError({ kind: "forbidden", message: "" }).recovery).toBe("none");
    expect(describePromotionWriteError({ kind: "server", message: "", status: 409 }).heading).toBe(
      "Promotion changed",
    );
    expect(describePromotionWriteError({ kind: "network", message: "" }).recovery).toBe("retry");
  });
});

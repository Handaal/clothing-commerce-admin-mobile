import { describe, expect, it } from "vitest";

import { meContext, TENANT_A } from "../test-support/fixtures";
import { promotionCapabilities } from "./capabilities";

describe("promotionCapabilities", () => {
  it("denies both capabilities when guidance is absent", () => {
    expect(promotionCapabilities(meContext(TENANT_A, { promotions: null }))).toEqual({
      canRead: false,
      canManage: false,
    });
  });

  it("keeps read-only guidance readable but not manageable", () => {
    expect(
      promotionCapabilities(
        meContext(TENANT_A, { promotions: { canRead: true, canManage: false } }),
      ),
    ).toEqual({ canRead: true, canManage: false });
  });

  it("does not infer read from manage", () => {
    expect(
      promotionCapabilities(
        meContext(TENANT_A, { promotions: { canRead: false, canManage: true } }),
      ),
    ).toEqual({ canRead: false, canManage: true });
  });
});

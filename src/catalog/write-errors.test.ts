import { describe, expect, it } from "vitest";

import type { ClassifiedCommerceError } from "../commerce/errors";
import { describeCatalogWriteError } from "./write-errors";

function err(partial: Partial<ClassifiedCommerceError>): ClassifiedCommerceError {
  return { kind: "server", message: "boom", ...partial };
}

describe("describeCatalogWriteError", () => {
  it("maps auth and forbidden to a terminal, non-retryable state", () => {
    expect(describeCatalogWriteError(err({ kind: "auth" })).recovery).toBe("none");
    const forbidden = describeCatalogWriteError(err({ kind: "forbidden", status: 403 }));
    expect(forbidden.recovery).toBe("none");
    expect(forbidden.heading).toBe("Not authorized");
  });

  it("maps uniqueness conflicts to editable recovery with distinct headings", () => {
    expect(describeCatalogWriteError(err({ code: "SLUG_CONFLICT" }))).toMatchObject({
      recovery: "edit",
      heading: "Slug already in use",
    });
    expect(describeCatalogWriteError(err({ code: "STYLE_CODE_CONFLICT" }))).toMatchObject({
      recovery: "edit",
      heading: "Style code already in use",
    });
    expect(describeCatalogWriteError(err({ code: "SKU_CONFLICT" }))).toMatchObject({
      recovery: "edit",
      heading: "SKU already in use",
    });
  });

  it("flags PRODUCT_NOT_PUBLISHABLE with the prerequisite explanation", () => {
    const d = describeCatalogWriteError(err({ code: "PRODUCT_NOT_PUBLISHABLE" }));
    expect(d.isNotPublishable).toBe(true);
    expect(d.recovery).toBe("edit");
    expect(d.message).toMatch(/active/i);
    expect(d.message).toMatch(/price/i);
  });

  it("routes state-drift codes to refresh", () => {
    for (const code of [
      "PRODUCT_PUBLISHED",
      "INVALID_LIFECYCLE_TRANSITION",
      "PRODUCT_NOT_FOUND",
      "VARIANT_NOT_FOUND",
      "MEDIA_NOT_FOUND",
    ]) {
      expect(describeCatalogWriteError(err({ code })).recovery).toBe("refresh");
    }
  });

  it("treats an idempotency conflict as terminal", () => {
    expect(describeCatalogWriteError(err({ code: "IDEMPOTENCY_CONFLICT" })).recovery).toBe("none");
  });

  it("treats a bare 400 as an editable validation problem", () => {
    expect(describeCatalogWriteError(err({ status: 400 })).recovery).toBe("edit");
  });

  it("treats network failures as an ambiguous retry", () => {
    expect(describeCatalogWriteError(err({ kind: "network" })).recovery).toBe("retry");
  });

  it("treats an unclassified server failure as retryable", () => {
    expect(describeCatalogWriteError(err({ kind: "server", status: 500 })).recovery).toBe("retry");
  });

  it("never collapses a known failure into a generic message", () => {
    expect(describeCatalogWriteError(err({ code: "SLUG_CONFLICT" })).heading).not.toBe(
      "Something went wrong",
    );
  });
});

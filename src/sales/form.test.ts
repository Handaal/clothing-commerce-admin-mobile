import { describe, expect, it } from "vitest";

import { buildContentRequest, validateContentForm } from "../storefront/content-form";
import {
  buildCreatePromotionRequest,
  EMPTY_PROMOTION_FORM,
  validatePromotionForm,
} from "../promotions/form";
import {
  buildCreateSaleRequest,
  EMPTY_SALE_FORM,
  previewSalePrice,
  saleToForm,
  validateSaleForm,
} from "./form";
import { saleLiveState } from "./display";

describe("sale form", () => {
  it("builds a 34% sale on everything", () => {
    const form = { ...EMPTY_SALE_FORM, name: "Winter", value: "34" };
    expect(validateSaleForm(form)).toEqual({});
    expect(buildCreateSaleRequest(form)).toEqual({
      name: "Winter",
      benefitType: "percentage",
      benefitPercentBp: 3400,
      scope: "all",
      startsAt: null,
      endsAt: null,
      status: "active",
    });
  });

  it("builds a fixed sale on a collection and requires the collection", () => {
    const form = {
      ...EMPTY_SALE_FORM,
      name: "Tees",
      benefitType: "fixed_amount" as const,
      value: "100",
      scope: "collection" as const,
    };
    expect(validateSaleForm(form).collectionId).toBeTruthy();
    const ready = { ...form, collectionId: "c-1" };
    expect(buildCreateSaleRequest(ready)).toMatchObject({
      benefitAmountMinor: 10000,
      benefitCurrency: "EGP",
      scope: "collection",
      collectionId: "c-1",
    });
  });

  it("requires products for a products-scoped sale and an ordered window", () => {
    const errors = validateSaleForm({
      ...EMPTY_SALE_FORM,
      name: "x",
      value: "10",
      scope: "products",
      startsAt: "2026-12-10",
      endsAt: "2026-12-01",
    });
    expect(errors.productIds).toBeTruthy();
    expect(errors.endsAt).toBeTruthy();
  });

  it("previews the shopper price like the server (690 at 34% -> 456)", () => {
    expect(previewSalePrice({ ...EMPTY_SALE_FORM, value: "34" }, 69_000)).toBe(45_540);
    expect(
      previewSalePrice({ ...EMPTY_SALE_FORM, benefitType: "fixed_amount", value: "800" }, 69_000),
    ).toBe(0);
  });

  it("round-trips a saved sale and derives its live state", () => {
    const sale = {
      id: "s",
      name: "Sale",
      status: "active" as const,
      benefitType: "percentage" as const,
      benefitPercentBp: 2550,
      benefitAmountMinor: null,
      benefitCurrency: null,
      scope: "products" as const,
      collectionId: null,
      productIds: ["p1"],
      startsAt: "2999-01-01T00:00:00.000Z",
      endsAt: null,
      createdAt: "x",
      updatedAt: "x",
    };
    expect(saleToForm(sale)).toMatchObject({ value: "25.5", productIds: ["p1"], active: true });
    expect(saleLiveState(sale)).toBe("scheduled");
    expect(saleLiveState({ ...sale, status: "inactive" })).toBe("paused");
  });
});

describe("buy X get Y offer form", () => {
  it("builds an online-only offer with quantities", () => {
    const form = { ...EMPTY_PROMOTION_FORM, name: "B2G1", benefitType: "buy_x_get_y" as const };
    expect(validatePromotionForm(form, "create")).toEqual({});
    expect(buildCreatePromotionRequest(form)).toMatchObject({
      benefitType: "buy_x_get_y",
      buyQuantity: 2,
      getQuantity: 1,
      channel: "online",
    });
  });

  it("rejects invalid quantities", () => {
    const errors = validatePromotionForm(
      {
        ...EMPTY_PROMOTION_FORM,
        name: "x",
        benefitType: "buy_x_get_y",
        buyQuantity: "0",
        getQuantity: "abc",
      },
      "create",
    );
    expect(errors.buyQuantity).toBeTruthy();
    expect(errors.getQuantity).toBeTruthy();
  });
});

describe("storefront content form", () => {
  const empty = {
    eyebrow: "",
    title: "",
    subtitle: "",
    ctaLabel: "",
    ctaHref: "",
    image: null,
    imageAlt: "",
    featuredHeading: "",
    featuredProductIds: [],
    featuredCollectionIds: [],
  };

  it("rejects unsafe or missing button links", () => {
    expect(validateContentForm({ ...empty, ctaHref: "javascript:alert(1)" }).ctaHref).toBeTruthy();
    expect(validateContentForm({ ...empty, ctaLabel: "Shop" }).ctaHref).toBeTruthy();
    expect(validateContentForm({ ...empty, ctaLabel: "Shop", ctaHref: "/catalog" })).toEqual({});
  });

  it("sends empty strings as null and keeps featured order", () => {
    const request = buildContentRequest({
      ...empty,
      title: " Drop ",
      image: { bucket: "product-media", path: "t/storefront/a.png" },
      featuredProductIds: ["b", "a"],
    });
    expect(request.hero).toEqual({
      eyebrow: null,
      title: "Drop",
      subtitle: null,
      ctaLabel: null,
      ctaHref: null,
      image: { bucket: "product-media", path: "t/storefront/a.png", altText: null },
    });
    expect(request.featuredProductIds).toEqual(["b", "a"]);
  });
});

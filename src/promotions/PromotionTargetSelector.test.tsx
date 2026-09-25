// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PRODUCT_A,
  VARIANT_A,
  productDetail,
  productList,
  productListItem,
} from "../test-support/fixtures";
import { PromotionTargetSelector } from "./PromotionTargetSelector";

afterEach(() => cleanup());

describe("PromotionTargetSelector", () => {
  it("adds canonical Product and Variant choices without any raw UUID input", async () => {
    const onChange = vi.fn();
    const client = {
      listProducts: vi.fn(async () => productList([productListItem(PRODUCT_A, "Linen Shirt")])),
      getProduct: vi.fn(async () => productDetail()),
    };
    const view = render(
      <PromotionTargetSelector client={client} choices={[]} onChange={onChange} />,
    );
    fireEvent.click(await screen.findByTestId(`promotion-target-product-${PRODUCT_A}`));
    fireEvent.click(await screen.findByTestId("promotion-target-add-product"));
    expect(onChange).toHaveBeenCalledWith([
      { target: { productId: PRODUCT_A, variantId: null }, label: "Linen Shirt" },
    ]);

    view.rerender(
      <PromotionTargetSelector
        client={client}
        choices={[{ target: { productId: PRODUCT_A, variantId: null }, label: "Linen Shirt" }]}
        onChange={onChange}
      />,
    );
    fireEvent.click(await screen.findByTestId(`promotion-target-product-${PRODUCT_A}`));
    fireEvent.click(await screen.findByTestId(`promotion-target-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId("promotion-target-add-variant"));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        { target: { productId: PRODUCT_A, variantId: null }, label: "Linen Shirt" },
        { target: { productId: null, variantId: VARIANT_A }, label: "Linen Shirt · Medium" },
      ]),
    );
    expect(screen.queryByPlaceholderText(/uuid|id/i)).toBeNull();
  });
});

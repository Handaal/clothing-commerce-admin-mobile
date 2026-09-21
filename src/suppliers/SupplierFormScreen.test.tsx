// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import { SUPPLIER_A, fakeSupplierAdapter, supplier } from "../test-support/fixtures";
import { SupplierFormScreen } from "./SupplierFormScreen";

afterEach(() => cleanup());

const noop = () => {};

describe("SupplierFormScreen — no adapter (no Supplier API yet)", () => {
  it("renders the unavailable state for create and never presents a working form", () => {
    render(<SupplierFormScreen mode="create" adapter={null} onSaved={noop} onBack={noop} />);
    expect(screen.getByTestId("supplier-unavailable")).toBeTruthy();
    // The form and its submit control must not exist — no fake successful mutation is possible.
    expect(screen.queryByTestId("supplier-submit")).toBeNull();
    expect(screen.queryByTestId("supplier-name")).toBeNull();
  });

  it("renders the unavailable state for edit too", () => {
    render(
      <SupplierFormScreen
        mode="edit"
        adapter={null}
        supplierId={SUPPLIER_A}
        onSaved={noop}
        onBack={noop}
      />,
    );
    expect(screen.getByTestId("supplier-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("supplier-submit")).toBeNull();
  });
});

describe("SupplierFormScreen — edit with an adapter", () => {
  it("loads the supplier through the adapter and hands its values to the form", async () => {
    const getSupplier = vi
      .fn()
      .mockResolvedValue(supplier({ id: SUPPLIER_A, name: "Nile Textiles" }));
    const adapter = fakeSupplierAdapter({ getSupplier });
    render(
      <SupplierFormScreen
        mode="edit"
        adapter={adapter}
        supplierId={SUPPLIER_A}
        onSaved={noop}
        onBack={noop}
      />,
    );
    // The form appears only after the real load resolves.
    const nameField = (await screen.findByTestId("supplier-name")) as HTMLInputElement;
    expect(nameField.value).toBe("Nile Textiles");
    expect(getSupplier).toHaveBeenCalledWith(SUPPLIER_A);
  });
});

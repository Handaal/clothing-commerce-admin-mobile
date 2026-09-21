// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// idempotency.ts imports expo-crypto; stub it so the graph loads. Tests inject deterministic keys.
vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import { SUPPLIER_A, fakeSupplierAdapter, supplier } from "../test-support/fixtures";
import { SupplierForm } from "./SupplierForm";

afterEach(() => cleanup());

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

function typeInto(testID: string, value: string) {
  fireEvent.change(screen.getByTestId(testID), { target: { value } });
}

const noop = () => {};

describe("SupplierForm — create", () => {
  it("blocks submit and shows a field error when the name is empty — no mutation is attempted", () => {
    const createSupplier = vi.fn();
    const adapter = fakeSupplierAdapter({ createSupplier });
    render(
      <SupplierForm
        mode="create"
        adapter={adapter}
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    fireEvent.click(screen.getByTestId("supplier-submit"));
    expect(screen.getByTestId("supplier-name-error")).toBeTruthy();
    expect(createSupplier).not.toHaveBeenCalled();
  });

  it("validates email format before submit", () => {
    const createSupplier = vi.fn();
    const adapter = fakeSupplierAdapter({ createSupplier });
    render(
      <SupplierForm
        mode="create"
        adapter={adapter}
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    typeInto("supplier-name", "Nile Textiles");
    typeInto("supplier-email", "not-an-email");
    fireEvent.click(screen.getByTestId("supplier-submit"));
    expect(screen.getByTestId("supplier-email-error")).toBeTruthy();
    expect(createSupplier).not.toHaveBeenCalled();
  });

  it("submits a normalized draft through the adapter with an idempotency key, then reports success", async () => {
    const createSupplier = vi
      .fn()
      .mockResolvedValue(supplier({ id: SUPPLIER_A, name: "Nile Textiles", status: "active" }));
    const onSaved = vi.fn();
    const adapter = fakeSupplierAdapter({ createSupplier });
    render(
      <SupplierForm
        mode="create"
        adapter={adapter}
        onSaved={onSaved}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    typeInto("supplier-name", "  Nile Textiles  ");
    typeInto("supplier-email", "ORDERS@Supplier.Example");
    fireEvent.click(screen.getByTestId("supplier-submit"));

    expect(await screen.findByTestId("supplier-saved-continue")).toBeTruthy();
    expect(createSupplier).toHaveBeenCalledTimes(1);
    expect(createSupplier.mock.calls[0][0]).toEqual({
      name: "Nile Textiles",
      email: "orders@supplier.example",
      status: "active",
    });
    expect(createSupplier.mock.calls[0][1]).toBe("K1");

    fireEvent.click(screen.getByTestId("supplier-saved-continue"));
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUPPLIER_A, name: "Nile Textiles" }),
    );
  });

  it("submits the free-form address verbatim in the draft", async () => {
    const createSupplier = vi
      .fn()
      .mockResolvedValue(supplier({ id: SUPPLIER_A, name: "Nile Textiles", status: "active" }));
    const adapter = fakeSupplierAdapter({ createSupplier });
    render(
      <SupplierForm
        mode="create"
        adapter={adapter}
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    typeInto("supplier-name", "Nile Textiles");
    typeInto("supplier-address", "12 Corniche El Nil, Cairo");
    fireEvent.click(screen.getByTestId("supplier-submit"));

    expect(await screen.findByTestId("supplier-saved-continue")).toBeTruthy();
    expect(createSupplier.mock.calls[0][0]).toEqual({
      name: "Nile Textiles",
      address: "12 Corniche El Nil, Cairo",
      status: "active",
    });
  });

  it("blocks a duplicate submit while the create is in flight", () => {
    const createSupplier = vi.fn().mockReturnValue(new Promise(() => {}));
    const adapter = fakeSupplierAdapter({ createSupplier });
    render(
      <SupplierForm
        mode="create"
        adapter={adapter}
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1", "K2")}
      />,
    );
    typeInto("supplier-name", "Nile Textiles");
    fireEvent.click(screen.getByTestId("supplier-submit"));
    fireEvent.click(screen.getByTestId("supplier-submit"));
    expect(createSupplier).toHaveBeenCalledTimes(1);
  });

  it("reuses the SAME idempotency key when retrying an ambiguous network failure", async () => {
    const createSupplier = vi
      .fn()
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(supplier({ id: SUPPLIER_A }));
    const adapter = fakeSupplierAdapter({ createSupplier });
    render(
      <SupplierForm
        mode="create"
        adapter={adapter}
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1", "K2")}
      />,
    );
    typeInto("supplier-name", "Nile Textiles");
    fireEvent.click(screen.getByTestId("supplier-submit"));

    fireEvent.click(await screen.findByTestId("supplier-submit-retry"));
    expect(await screen.findByTestId("supplier-saved-continue")).toBeTruthy();
    expect(createSupplier).toHaveBeenCalledTimes(2);
    expect(createSupplier.mock.calls[0][1]).toBe("K1");
    expect(createSupplier.mock.calls[1][1]).toBe("K1"); // reused, not regenerated
  });

  it("shows an access-denied error with no retry on 403", async () => {
    const createSupplier = vi
      .fn()
      .mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    const adapter = fakeSupplierAdapter({ createSupplier });
    render(
      <SupplierForm
        mode="create"
        adapter={adapter}
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    typeInto("supplier-name", "Nile Textiles");
    fireEvent.click(screen.getByTestId("supplier-submit"));
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByTestId("supplier-submit-retry")).toBeNull();
  });

  it("surfaces a duplicate reference code as a correctable edit (never a fake success)", async () => {
    const onSaved = vi.fn();
    const createSupplier = vi
      .fn()
      .mockRejectedValue(new ApiHttpError("dup", 409, "SUPPLIER_CODE_CONFLICT", null));
    const adapter = fakeSupplierAdapter({ createSupplier });
    render(
      <SupplierForm
        mode="create"
        adapter={adapter}
        onSaved={onSaved}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    typeInto("supplier-name", "Nile Textiles");
    typeInto("supplier-reference", "SUP-001");
    fireEvent.click(screen.getByTestId("supplier-submit"));

    expect(await screen.findByText("Reference code already in use")).toBeTruthy();
    // A correctable rejection offers an edit affordance, not a key-reusing retry, and never saves.
    expect(screen.getByTestId("supplier-submit-edit")).toBeTruthy();
    expect(screen.queryByTestId("supplier-submit-retry")).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("SupplierForm — edit", () => {
  it("seeds the fields from the initial supplier and updates by id", async () => {
    const updateSupplier = vi
      .fn()
      .mockResolvedValue(supplier({ id: SUPPLIER_A, name: "Nile Textiles Renamed" }));
    const adapter = fakeSupplierAdapter({ updateSupplier });
    const initial = supplier({ id: SUPPLIER_A, name: "Nile Textiles", status: "active" });
    render(
      <SupplierForm
        mode="edit"
        adapter={adapter}
        initial={initial}
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    // The name field is pre-filled from the initial supplier.
    expect((screen.getByTestId("supplier-name") as HTMLInputElement).value).toBe("Nile Textiles");

    typeInto("supplier-name", "Nile Textiles Renamed");
    fireEvent.click(screen.getByTestId("supplier-submit"));

    expect(await screen.findByTestId("supplier-saved-continue")).toBeTruthy();
    expect(updateSupplier).toHaveBeenCalledTimes(1);
    expect(updateSupplier.mock.calls[0][0]).toBe(SUPPLIER_A);
    expect(updateSupplier.mock.calls[0][1]).toEqual(
      expect.objectContaining({ name: "Nile Textiles Renamed", status: "active" }),
    );
    expect(updateSupplier.mock.calls[0][2]).toBe("K1");
  });
});

// @vitest-environment jsdom
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrandForm, CommerceForm, RegisterForm } from "./SettingsForms";
import {
  BranchFormScreen,
  BrandFormScreen,
  BusinessSettingsScreen,
  CommerceSettingsScreen,
  DeviceDetailScreen,
  DevicesSettingsScreen,
  InventoryLocationCreateScreen,
  InventoryLocationDetailScreen,
  InventorySettingsScreen,
  ReceiptSettingsScreen,
  RegisterFormScreen,
  SettingsHomeScreen,
  WarehouseCreateScreen,
} from "./SettingsScreens";
import {
  brand,
  branch,
  business,
  commerce,
  fakeSettingsAdapter,
  location,
  register,
} from "./test-fixtures";

const noop = () => {};
afterEach(() => cleanup());

describe("Phase 2R Settings preparation", () => {
  it("shows the seven compact Settings home sections", () => {
    render(<SettingsHomeScreen canRead canManage onOpen={noop} onBack={noop} />);
    for (const id of [
      "business",
      "brands",
      "branches",
      "inventory",
      "registers",
      "commerce",
      "receipt",
    ]) {
      expect(screen.getByTestId(`settings-section-${id}`)).toBeTruthy();
    }
    expect(screen.getByText("Registers & Devices")).toBeTruthy();
  });

  it("keeps all sections readable while hiding management actions in read-only mode", async () => {
    render(
      <BusinessSettingsScreen
        adapter={fakeSettingsAdapter()}
        canRead
        canManage={false}
        onBack={noop}
      />,
    );
    expect(await screen.findByTestId("settings-read-only")).toBeTruthy();
    expect(screen.getByText(business.displayName)).toBeTruthy();
    expect(screen.queryByTestId("save-business")).toBeNull();
  });

  it("keeps Brand and Register details readable without management affordances", async () => {
    const adapter = fakeSettingsAdapter();
    const { unmount } = render(
      <BrandFormScreen
        adapter={adapter}
        canRead
        canManage={false}
        brandId={brand.id}
        onBack={noop}
      />,
    );
    expect(await screen.findByText(brand.legalName)).toBeTruthy();
    expect(screen.queryByTestId("save-brand")).toBeNull();
    unmount();
    render(
      <RegisterFormScreen
        adapter={adapter}
        canRead
        canManage={false}
        registerId={register.id}
        onBack={noop}
      />,
    );
    expect(await screen.findByText(register.sellingCurrency)).toBeTruthy();
    expect(screen.queryByTestId("save-register")).toBeNull();
  });

  it("renders the Business form and keeps tenant slug immutable", async () => {
    render(
      <BusinessSettingsScreen adapter={fakeSettingsAdapter()} canRead canManage onBack={noop} />,
    );
    expect(await screen.findByTestId("business-display-name")).toBeTruthy();
    expect(screen.getByText("Tenant slug · read-only")).toBeTruthy();
    expect(screen.getByText("acme-apparel")).toBeTruthy();
    expect(screen.getByTestId("business-currency-warning")).toBeTruthy();
  });

  it("shows editable Brand code during create and read-only code after creation", () => {
    const { rerender } = render(<BrandForm mode="create" onSave={async () => brand} />);
    expect(screen.getByTestId("brand-code")).toBeTruthy();
    rerender(<BrandForm mode="edit" initial={brand} onSave={async () => brand} />);
    expect(screen.queryByTestId("brand-code")).toBeNull();
    expect(screen.getByText("Brand code · read-only")).toBeTruthy();
  });

  it("prepares the Branch form and lifecycle without a hard-delete action", async () => {
    render(
      <BranchFormScreen
        adapter={fakeSettingsAdapter()}
        canRead
        canManage
        branchId={branch.id}
        onBack={noop}
      />,
    );
    expect(await screen.findByTestId("branch-display-name")).toBeTruthy();
    expect(screen.getByText("Branch code · read-only")).toBeTruthy();
    expect(screen.getByTestId("branch-fulfillment-yes")).toBeTruthy();
    expect(screen.getByTestId("branch-collect-yes")).toBeTruthy();
    expect(screen.getByTestId("settings-lifecycle")).toBeTruthy();
    expect(screen.getByText("Eligible Brands")).toBeTruthy();
    expect(screen.getByTestId(`branch-brand-${brand.id}-yes`)).toBeTruthy();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("uses explicit Warehouse and InventoryLocation terminology", async () => {
    render(
      <InventorySettingsScreen
        adapter={fakeSettingsAdapter()}
        canRead
        canManage
        onBack={noop}
        onOpenWarehouse={noop}
        onOpenLocation={noop}
      />,
    );
    expect(await screen.findByText("Warehouses")).toBeTruthy();
    expect(screen.getByText("InventoryLocations")).toBeTruthy();
    expect(screen.getByText("Cairo Warehouse")).toBeTruthy();
    expect(screen.getByText("Flagship Stockroom")).toBeTruthy();
  });

  it("keeps InventoryLocation parent and type read-only after creation", async () => {
    render(
      <InventoryLocationDetailScreen
        adapter={fakeSettingsAdapter()}
        canRead
        canManage
        id={location.id}
        onBack={noop}
      />,
    );
    expect(await screen.findByText("Parent · read-only")).toBeTruthy();
    expect(screen.getByText("Location type · read-only")).toBeTruthy();
    expect(screen.getByTestId("save-inventory-settings")).toBeTruthy();
  });

  it("creates Warehouses and InventoryLocations through canonical parent selectors", async () => {
    const adapter = fakeSettingsAdapter();
    const { unmount } = render(
      <WarehouseCreateScreen adapter={adapter} canRead canManage onBack={noop} />,
    );
    expect(screen.getByTestId("warehouse-code")).toBeTruthy();
    expect(screen.getByTestId("save-warehouse")).toBeTruthy();
    unmount();
    render(<InventoryLocationCreateScreen adapter={adapter} canRead canManage onBack={noop} />);
    expect(await screen.findByTestId(`location-parent-branch:${branch.id}`)).toBeTruthy();
    expect(screen.getByTestId("location-type")).toBeTruthy();
    expect(screen.queryByText(/parent UUID/i)).toBeNull();
  });

  it("keeps Register Branch and code read-only after creation", async () => {
    render(
      <RegisterFormScreen
        adapter={fakeSettingsAdapter()}
        canRead
        canManage
        registerId={register.id}
        onBack={noop}
      />,
    );
    expect(await screen.findByText("Register code · read-only")).toBeTruthy();
    expect(screen.getByText("Branch · read-only")).toBeTruthy();
    expect(screen.queryByTestId("register-code")).toBeNull();
  });

  it("presents a server-returned Register currency history lock without bypassing it", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new ApiHttpError(
          "Currency cannot be changed after the register has recorded sales.",
          409,
          "LOCKED",
          null,
        ),
      );
    render(
      <RegisterForm
        mode="edit"
        initial={register}
        branchOptions={[]}
        locationOptions={[]}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByTestId("register-currency"), { target: { value: "USD" } });
    fireEvent.click(screen.getByTestId("save-register"));
    expect(await screen.findByTestId("settings-save-error-historical-lock")).toBeTruthy();
    expect(
      screen.getByText("This value cannot be changed after commercial history exists."),
    ).toBeTruthy();
  });

  it("renders Device list/detail governance, assignment, and revoke confirmation only", async () => {
    const adapter = fakeSettingsAdapter();
    const { unmount } = render(
      <DevicesSettingsScreen adapter={adapter} canRead canManage onBack={noop} onOpen={noop} />,
    );
    expect(await screen.findByText("Front iPad")).toBeTruthy();
    unmount();
    render(<DeviceDetailScreen adapter={adapter} canRead canManage id="device-1" onBack={noop} />);
    expect(await screen.findByTestId("assign-device")).toBeTruthy();
    fireEvent.click(screen.getByTestId("revoke-device"));
    expect(screen.getByText("Confirm Device revocation")).toBeTruthy();
    expect(screen.queryByText(/enroll/i)).toBeNull();
    expect(screen.queryByText(/key rotation/i)).toBeNull();
    expect(screen.queryByText(/private key/i)).toBeNull();
  });

  it("prepares Storefront COD and bounded Returns settings", async () => {
    render(
      <CommerceSettingsScreen adapter={fakeSettingsAdapter()} canRead canManage onBack={noop} />,
    );
    expect(await screen.findByText("Storefront")).toBeTruthy();
    expect(screen.getByTestId("storefront-cod-yes")).toBeTruthy();
    expect(screen.getByText("Returns")).toBeTruthy();
    expect(screen.getByTestId("returns-window")).toBeTruthy();
    expect(screen.queryByText(/payment gateway/i)).toBeNull();
    expect(screen.queryByText(/shipping engine/i)).toBeNull();
  });

  it("shows the canonical Storefront currency-history rejection", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new ApiHttpError(
          "Currency cannot change once commercial history exists.",
          409,
          "CURRENCY_LOCKED",
          null,
        ),
      );
    render(
      <CommerceForm
        value={commerce}
        brandOptions={[{ id: brand.id, label: brand.displayName }]}
        locationOptions={[{ id: location.id, label: location.displayName }]}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByTestId("save-commerce"));
    expect(await screen.findByTestId("settings-save-error-historical-lock")).toBeTruthy();
  });

  it("renders receipt identity/footer and a fixed preview without a designer", async () => {
    render(
      <ReceiptSettingsScreen adapter={fakeSettingsAdapter()} canRead canManage onBack={noop} />,
    );
    expect(await screen.findByTestId("receipt-business-name")).toBeTruthy();
    expect(screen.getByTestId("receipt-footer")).toBeTruthy();
    expect(screen.getByTestId("receipt-preview")).toBeTruthy();
    expect(screen.queryByText(/drag\/drop/i)).toBeNull();
    expect(screen.queryByText(/HTML template/i)).toBeNull();
  });

  it("covers access-denied, unavailable, loading, empty, and error states", async () => {
    const { rerender } = render(
      <BusinessSettingsScreen adapter={null} canRead={false} canManage={false} onBack={noop} />,
    );
    expect(screen.getByTestId("settings-access-denied")).toBeTruthy();
    rerender(<BusinessSettingsScreen adapter={null} canRead canManage onBack={noop} />);
    expect(screen.getByTestId("settings-unavailable")).toBeTruthy();
    rerender(
      <DevicesSettingsScreen
        adapter={fakeSettingsAdapter({ listDevices: () => new Promise(() => {}) })}
        canRead
        canManage
        onBack={noop}
        onOpen={noop}
      />,
    );
    expect(screen.getByText("Loading settings…")).toBeTruthy();
    rerender(
      <DevicesSettingsScreen
        adapter={fakeSettingsAdapter({ listDevices: async () => [] })}
        canRead
        canManage
        onBack={noop}
        onOpen={noop}
      />,
    );
    expect(await screen.findByTestId("settings-empty")).toBeTruthy();
    rerender(
      <DevicesSettingsScreen
        adapter={fakeSettingsAdapter({
          listDevices: async () => {
            throw new Error("boom");
          },
        })}
        canRead
        canManage
        onBack={noop}
        onOpen={noop}
      />,
    );
    expect(await screen.findByTestId("settings-error")).toBeTruthy();
  });
});

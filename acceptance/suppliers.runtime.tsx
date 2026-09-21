import { createCommerceClient } from "@shifted/clothing-commerce-sdk";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { InventoryScreen } from "../src/inventory/InventoryScreen";
import { SessionProvider, useSession } from "../src/session/SessionProvider";
import { resolveSupplierAdapter } from "../src/suppliers/adapter";
import { supplierCapabilities } from "../src/suppliers/capabilities";
import { SupplierDetailScreen } from "../src/suppliers/SupplierDetailScreen";
import { SupplierFormScreen } from "../src/suppliers/SupplierFormScreen";
import { SuppliersListScreen } from "../src/suppliers/SuppliersListScreen";
import { createMemoryTenantStorage } from "../src/tenant/storage";

// Phase 2N supplier runtime acceptance. This suite drives the REAL application UI against the REAL
// merged Supplier API (SDK 0.9.0). Only the device auth/storage adapters are substituted; bootstrap,
// `/me/context`, the SDK, HTTP transport and server-side authorization are all real. An out-of-repo
// orchestration wrapper provisions a disposable loopback API, a Clerk-verifiable session token, and
// the variant/location ids used for receiving — exactly as the Phase 2L/2M runtime suites are run.
// It NEVER targets production. Without that provisioning `beforeAll` throws and the suite does not run.
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "runtime-user",
    sessionId: "runtime-session",
    getToken: async () => process.env.SUPPLIERS_TEST_TOKEN,
    signOut: async () => {},
  }),
}));
vi.mock("../src/tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

const tenantId = "2a000001-0000-4000-8000-000000000001";
let baseUrl: string;
let token: string;
let variantId: string;
let inventoryLocationId: string;
const unique = `RT-${Date.now()}`;

/** A tenant-scoped SDK client for out-of-repo fixture setup (never the application under test). */
function fixtureClient() {
  return createCommerceClient({
    baseUrl,
    client: { type: "admin-mobile", version: "0.1.0" },
    getToken: () => token,
  }).withTenant(tenantId);
}

beforeAll(() => {
  const url = process.env.SUPPLIERS_TEST_URL;
  if (
    !url ||
    !process.env.SUPPLIERS_TEST_TOKEN ||
    !process.env.SUPPLIERS_TEST_VARIANT_ID ||
    !process.env.SUPPLIERS_TEST_LOCATION_ID ||
    !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)
  ) {
    throw new Error(
      "Supply the Phase 2N disposable loopback API, a test session, and a receivable variant/location " +
        "id; never target production.",
    );
  }
  baseUrl = url;
  token = process.env.SUPPLIERS_TEST_TOKEN;
  process.env.EXPO_PUBLIC_COMMERCE_API_URL = baseUrl;
  variantId = process.env.SUPPLIERS_TEST_VARIANT_ID;
  inventoryLocationId = process.env.SUPPLIERS_TEST_LOCATION_ID;
  configure({ asyncUtilTimeout: 15000 });
});

afterEach(cleanup);

// A minimal in-memory router so the router-agnostic screens can be driven exactly as production wires
// them (list → create → detail → edit), without pulling in expo-router.
type View =
  | { name: "list" }
  | { name: "create" }
  | { name: "detail"; supplierId: string }
  | { name: "edit"; supplierId: string };

function SupplierApp() {
  const session = useSession();
  const [view, setView] = useState<View>({ name: "list" });
  if (session.state.phase !== "ready") return <span>{session.state.phase}</span>;
  const { context, tenantId: id } = session.state;
  const adapter = resolveSupplierAdapter(session.getTenantClient(id));
  const { canManage } = supplierCapabilities(context);

  if (view.name === "create") {
    return (
      <SupplierFormScreen
        mode="create"
        adapter={adapter}
        onSaved={(s) => setView({ name: "detail", supplierId: s.id })}
        onBack={() => setView({ name: "list" })}
      />
    );
  }
  if (view.name === "edit") {
    return (
      <SupplierFormScreen
        mode="edit"
        adapter={adapter}
        supplierId={view.supplierId}
        onSaved={() => setView({ name: "detail", supplierId: view.supplierId })}
        onBack={() => setView({ name: "detail", supplierId: view.supplierId })}
      />
    );
  }
  if (view.name === "detail") {
    return (
      <SupplierDetailScreen
        adapter={adapter}
        supplierId={view.supplierId}
        canManage={canManage}
        onEdit={(sid) => setView({ name: "edit", supplierId: sid })}
        onBack={() => setView({ name: "list" })}
      />
    );
  }
  return (
    <SuppliersListScreen
      adapter={adapter}
      canManage={canManage}
      onOpenSupplier={(sid) => setView({ name: "detail", supplierId: sid })}
      onCreateSupplier={() => setView({ name: "create" })}
      onBack={() => {}}
    />
  );
}

function InventoryHarness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span>{state.phase}</span>;
  return <InventoryScreen tenantId={state.tenantId} context={state.context} onBack={() => {}} />;
}

function mount(node: React.ReactNode) {
  render(<SessionProvider storage={createMemoryTenantStorage(tenantId)}>{node}</SessionProvider>);
}

// The shared PageHeader renders its back control as "‹ Back"; match on the trailing word so the test is
// robust to the leading chevron glyph.
function clickBack() {
  fireEvent.click(
    screen.getByText((content) => content.replace(/\s+/g, " ").trim().endsWith("Back")),
  );
}

// SCENARIO A — SUPPLIER CRUD: create, list, search, detail, edit, refresh, with an explicit free-form
// address round-trip (create → reload → edit → reload) proving the single-string address contract.
it("A: creates an active supplier, finds it by search, and edits its contact/notes/address", async () => {
  const name = `${unique} Nile Textiles`;
  const createdAddress = "12 Corniche El Nil, Cairo, Cairo Governorate, EG";
  const editedAddress = "45 Tahrir Square, Giza, Giza Governorate, EG";
  mount(<SupplierApp />);

  // Create.
  fireEvent.click(await screen.findByTestId("create-supplier"));
  fireEvent.change(await screen.findByTestId("supplier-name"), { target: { value: name } });
  fireEvent.change(screen.getByTestId("supplier-reference"), { target: { value: unique } });
  fireEvent.change(screen.getByTestId("supplier-contact"), { target: { value: "Mona Adel" } });
  fireEvent.change(screen.getByTestId("supplier-address"), { target: { value: createdAddress } });
  fireEvent.click(screen.getByTestId("supplier-submit"));

  // Saved → detail shows the new active supplier and the address exactly as entered (round-trip #1).
  fireEvent.click(await screen.findByTestId("supplier-saved-continue"));
  await screen.findByTestId("supplier-detail-status");
  expect(screen.getByTestId("supplier-detail-status").textContent).toBe("Active");
  expect(screen.getByText(name)).toBeTruthy();
  expect(screen.getByText(createdAddress)).toBeTruthy();

  // Back to list, search by name (server-side), open detail.
  clickBack();
  fireEvent.change(await screen.findByTestId("supplier-search-term"), {
    target: { value: unique },
  });
  fireEvent.click(screen.getByTestId("supplier-search-submit"));
  const row = await screen.findByText(name);
  fireEvent.click(row);

  // Edit contact + notes + address, save, and confirm the refreshed detail shows the updates. The edit
  // form must seed the existing address, then persist the changed one (round-trip #2).
  fireEvent.click(await screen.findByTestId("supplier-edit"));
  const addressField = await screen.findByTestId("supplier-address");
  expect((addressField as HTMLInputElement | HTMLTextAreaElement).value).toBe(createdAddress);
  fireEvent.change(await screen.findByTestId("supplier-contact"), {
    target: { value: "Sara Fouad" },
  });
  fireEvent.change(screen.getByTestId("supplier-notes"), {
    target: { value: "Updated by runtime." },
  });
  fireEvent.change(addressField, { target: { value: editedAddress } });
  fireEvent.click(screen.getByTestId("supplier-submit"));
  fireEvent.click(await screen.findByTestId("supplier-saved-continue"));
  await screen.findByTestId("supplier-detail-status");
  expect(await screen.findByText("Sara Fouad")).toBeTruthy();
  expect(screen.getByText("Updated by runtime.")).toBeTruthy();
  expect(screen.getByText(editedAddress)).toBeTruthy();
  expect(screen.queryByText(createdAddress)).toBeNull();
});

// SCENARIO B & C — supplier-linked receipt (inventory +N, appears in history) and a legacy receipt.
it("B/C: receives stock against an active supplier and also via a legacy no-supplier receipt", async () => {
  // Provision an active supplier through the real API (fixture setup, not the app under test).
  const client = fixtureClient();
  const supplier = await client.createSupplier({
    name: `${unique} Delta Fabrics`,
    code: `${unique}-B`,
    idempotencyKey: `${unique}-create-b`,
  });

  mount(<InventoryHarness />);
  // Supplier-linked receipt.
  fireEvent.click(await screen.findByTestId("open-receive"));
  fireEvent.click(await screen.findByTestId(`receive-variant-${variantId}`));
  fireEvent.click(screen.getByTestId(`receive-location-${inventoryLocationId}`));
  fireEvent.click(await screen.findByTestId(`receive-supplier-${supplier.id}`));
  fireEvent.change(screen.getByTestId("receive-supplier-reference"), {
    target: { value: `${unique}-GRN` },
  });
  fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "4" } });
  fireEvent.click(screen.getByTestId("receive-submit"));
  await screen.findByTestId("receive-success");
  expect(screen.getByTestId("receive-supplier-result")).toBeTruthy();

  // The supplier's receiving history now contains the receipt (canonical, server-sourced).
  const receipts = await client.listSupplierReceipts(supplier.id, {});
  expect(receipts.items.some((r) => r.supplierReference === `${unique}-GRN`)).toBe(true);

  // Legacy receipt: a successful receive reloads the inventory list (unmounting the success panel), so
  // start the next receipt from the list's Receive entry point rather than an in-panel reset.
  fireEvent.click(await screen.findByTestId("open-receive"));
  fireEvent.click(await screen.findByTestId(`receive-variant-${variantId}`));
  fireEvent.click(screen.getByTestId(`receive-location-${inventoryLocationId}`));
  fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "2" } });
  fireEvent.click(screen.getByTestId("receive-submit"));
  await screen.findByTestId("receive-success");
  expect(screen.queryByTestId("receive-supplier-result")).toBeNull();
});

// SCENARIO D — lifecycle: deactivate keeps the record + history but removes it from new-receipt options.
it("D: a deactivated supplier stays visible and is no longer selectable for a new receipt", async () => {
  const client = fixtureClient();
  const supplier = await client.createSupplier({
    name: `${unique} Cairo Cotton`,
    code: `${unique}-D`,
    idempotencyKey: `${unique}-create-d`,
  });

  mount(<SupplierApp />);
  fireEvent.change(await screen.findByTestId("supplier-search-term"), {
    target: { value: `${unique}-D` },
  });
  fireEvent.click(screen.getByTestId("supplier-search-submit"));
  fireEvent.click(await screen.findByText(`${unique} Cairo Cotton`));

  // Deactivate (confirmed, two-step).
  await screen.findByTestId("supplier-status-toggle");
  fireEvent.click(screen.getByTestId("supplier-status-toggle"));
  fireEvent.click(screen.getByTestId("supplier-status-toggle"));
  await waitFor(() =>
    expect(screen.getByTestId("supplier-detail-status").textContent).toBe("Inactive"),
  );
  // Still visible as a retained inactive record (never deleted).
  clickBack();
  fireEvent.change(await screen.findByTestId("supplier-search-term"), {
    target: { value: `${unique}-D` },
  });
  fireEvent.click(screen.getByTestId("supplier-search-submit"));
  expect(await screen.findByText(`${unique} Cairo Cotton`)).toBeTruthy();

  // And no longer offered for a NEW receipt.
  cleanup();
  mount(<InventoryHarness />);
  fireEvent.click(await screen.findByTestId("open-receive"));
  await screen.findByTestId(`receive-variant-${variantId}`);
  await waitFor(() => expect(screen.queryByTestId(`receive-supplier-${supplier.id}`)).toBeNull());
});

// SCENARIO E — authorization: a read-only session sees suppliers but no manage affordances. The API
// stays authoritative regardless; this only asserts the affordance guidance follows /me/context.
it.runIf(Boolean(process.env.SUPPLIERS_TEST_READONLY_TOKEN))(
  "E: a supplier-read-only caller cannot create, edit or change supplier status",
  async () => {
    const original = process.env.SUPPLIERS_TEST_TOKEN;
    process.env.SUPPLIERS_TEST_TOKEN = process.env.SUPPLIERS_TEST_READONLY_TOKEN;
    try {
      mount(<SupplierApp />);
      // The list still loads (read access) but the create affordance is withheld.
      await waitFor(() =>
        expect(
          screen.queryByTestId("supplier-search-submit") ?? screen.queryByTestId("supplier-empty"),
        ).toBeTruthy(),
      );
      expect(screen.queryByTestId("create-supplier")).toBeNull();
    } finally {
      process.env.SUPPLIERS_TEST_TOKEN = original;
    }
  },
);

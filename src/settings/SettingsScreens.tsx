import { useCallback, useState } from "react";
import { View } from "react-native";

import {
  Badge,
  Body,
  ConfirmButton,
  InfoRow,
  PressableRow,
  PrimaryButton,
  SelectField,
  TextField,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { SettingsAdapter } from "./adapter";
import type {
  BrandSettings,
  BranchSettings,
  BranchSettingsDraft,
  CapabilityFlags,
  DeviceSettings,
  InventoryLocationSettings,
  RegisterSettings,
  SettingsOption,
  WarehouseSettings,
} from "./model";
import {
  ReadOnlyNotice,
  SettingsAsync,
  SettingsFrame,
  SettingsSection,
  SettingsUnavailable,
} from "./SettingsCommon";
import {
  BrandForm,
  BranchForm,
  BusinessForm,
  CommerceForm,
  ReceiptForm,
  RegisterForm,
} from "./SettingsForms";

export type SettingsSectionKey =
  | "business"
  | "brands"
  | "branches"
  | "inventory"
  | "registers"
  | "devices"
  | "commerce"
  | "receipt";

export function SettingsHomeScreen({
  canRead,
  canManage,
  onOpen,
  onBack,
}: {
  canRead: boolean;
  canManage: boolean;
  onOpen: (section: SettingsSectionKey) => void;
  onBack: () => void;
}) {
  if (!canRead)
    return (
      <SettingsUnavailable
        title="Settings"
        canRead={false}
        transportPending={false}
        onBack={onBack}
      />
    );
  const sections: Array<{ key: SettingsSectionKey; title: string; description: string }> = [
    {
      key: "business",
      title: "Business",
      description: "Identity, contacts, timezone, tax and currency",
    },
    { key: "brands", title: "Brands", description: "Brand identity and lifecycle" },
    {
      key: "branches",
      title: "Branches",
      description: "Operations, fulfillment, contacts and receipts",
    },
    { key: "inventory", title: "Inventory", description: "Warehouses and InventoryLocations" },
    {
      key: "registers",
      title: "Registers & Devices",
      description: "Selling stations and assigned devices",
    },
    {
      key: "commerce",
      title: "Commerce",
      description: "Storefront fulfillment and returns policy",
    },
    { key: "receipt", title: "Receipt", description: "Fixed-layout business and Branch identity" },
  ];
  return (
    <SettingsFrame title="Settings" onBack={onBack}>
      {!canManage ? <ReadOnlyNotice /> : null}
      <View style={{ gap: 12 }}>
        {sections.map((section) => (
          <PressableRow
            key={section.key}
            testID={`settings-section-${section.key}`}
            onPress={() => onOpen(section.key)}
          >
            <Title>{section.title}</Title>
            <Body>{section.description}</Body>
          </PressableRow>
        ))}
      </View>
    </SettingsFrame>
  );
}

export function BusinessSettingsScreen({ adapter, canRead, canManage, onBack }: BaseProps) {
  if (!canRead || !adapter)
    return <Pending title="Business" canRead={canRead} adapter={adapter} onBack={onBack} />;
  return <BusinessContent adapter={adapter} canManage={canManage} onBack={onBack} />;
}
function BusinessContent({
  adapter,
  canManage,
  onBack,
}: {
  adapter: SettingsAdapter;
  canManage: boolean;
  onBack: () => void;
}) {
  const load = useCallback(() => adapter.getBusiness(), [adapter]);
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title="Business" onBack={onBack}>
      {!canManage ? <ReadOnlyNotice /> : null}
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {(business) =>
          canManage ? (
            <BusinessForm value={business} onSave={(draft) => adapter.updateBusiness(draft)} />
          ) : (
            <View style={{ gap: 8 }}>
              <InfoRow label="Display name" value={business.displayName} />
              <InfoRow label="Legal name" value={business.legalName} />
              <InfoRow label="Tenant slug · read-only" value={business.slug} />
              <InfoRow label="Contact email" value={business.contactEmail} />
              <InfoRow label="Contact phone" value={business.contactPhone} />
              <InfoRow label="Timezone" value={business.timezone} />
              <InfoRow label="Country" value={business.country} />
              <InfoRow label="Tax identifier" value={business.taxIdentifier} />
              <InfoRow label="Default currency" value={business.defaultCurrency} />
            </View>
          )
        }
      </SettingsAsync>
    </SettingsFrame>
  );
}

export function BrandsSettingsScreen({
  adapter,
  canRead,
  canManage,
  onBack,
  onOpen,
  onCreate,
}: BaseProps & { onOpen: (id: string) => void; onCreate: () => void }) {
  if (!canRead || !adapter)
    return <Pending title="Brands" canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <EntityList<BrandSettings[]>
      title="Brands"
      canManage={canManage}
      createLabel="Create Brand"
      load={adapter.listBrands.bind(adapter)}
      onCreate={onCreate}
      onBack={onBack}
      empty={(items) => items.length === 0}
      render={(items) =>
        items.map((item) => (
          <EntityRow
            key={item.id}
            id={item.id}
            name={item.displayName}
            code={item.code}
            status={item.status}
            onOpen={onOpen}
          />
        ))
      }
    />
  );
}

export function BrandFormScreen({
  adapter,
  canRead,
  canManage,
  brandId,
  onBack,
}: BaseProps & { brandId?: string }) {
  if (!canRead || !adapter)
    return (
      <Pending
        title={brandId ? "Brand" : "Create Brand"}
        canRead={canRead}
        adapter={adapter}
        onBack={onBack}
      />
    );
  if (!canManage)
    return brandId ? (
      <BrandReadOnly adapter={adapter} id={brandId} onBack={onBack} />
    ) : (
      <SettingsFrame title="Create Brand" onBack={onBack}>
        <ReadOnlyNotice />
      </SettingsFrame>
    );
  return <BrandFormContent adapter={adapter} brandId={brandId} onBack={onBack} />;
}
function BrandFormContent({
  adapter,
  brandId,
  onBack,
}: {
  adapter: SettingsAdapter;
  brandId?: string;
  onBack: () => void;
}) {
  const load = useCallback(
    () => (brandId ? adapter.getBrand(brandId) : Promise.resolve(null)),
    [adapter, brandId],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={brandId ? "Brand details" : "Create Brand"} onBack={onBack}>
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {(brand) => (
          <>
            <BrandForm
              mode={brand ? "edit" : "create"}
              initial={brand ?? undefined}
              onSave={(draft) =>
                brand
                  ? adapter.updateBrand(brand.id, {
                      displayName: draft.displayName,
                      legalName: draft.legalName,
                      status: draft.status,
                    })
                  : adapter.createBrand(draft)
              }
            />
            {brand ? (
              <LifecycleActions
                status={brand.status}
                noun="Brand"
                onChange={(status) => adapter.setBrandStatus(brand.id, status)}
              />
            ) : null}
          </>
        )}
      </SettingsAsync>
    </SettingsFrame>
  );
}

function BrandReadOnly({
  adapter,
  id,
  onBack,
}: {
  adapter: SettingsAdapter;
  id: string;
  onBack: () => void;
}) {
  const load = useCallback(() => adapter.getBrand(id), [adapter, id]);
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title="Brand details" onBack={onBack}>
      <ReadOnlyNotice />
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {(value) => (
          <View style={{ gap: 8 }}>
            <Title>{value.displayName}</Title>
            <InfoRow label="Brand code · read-only" value={value.code} />
            <InfoRow label="Legal name" value={value.legalName} />
            <Badge label={value.status} />
          </View>
        )}
      </SettingsAsync>
    </SettingsFrame>
  );
}

export function BranchesSettingsScreen({
  adapter,
  canRead,
  canManage,
  onBack,
  onOpen,
  onCreate,
}: BaseProps & { onOpen: (id: string) => void; onCreate: () => void }) {
  if (!canRead || !adapter)
    return <Pending title="Branches" canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <EntityList<BranchSettings[]>
      title="Branches"
      canManage={canManage}
      createLabel="Create Branch"
      load={adapter.listBranches.bind(adapter)}
      onCreate={onCreate}
      onBack={onBack}
      empty={(items) => items.length === 0}
      render={(items) =>
        items.map((item) => (
          <EntityRow
            key={item.id}
            id={item.id}
            name={item.displayName}
            code={item.code}
            status={item.status}
            onOpen={onOpen}
          />
        ))
      }
    />
  );
}

export function BranchFormScreen({
  adapter,
  canRead,
  canManage,
  branchId,
  onBack,
}: BaseProps & { branchId?: string }) {
  if (!canRead || !adapter)
    return (
      <Pending
        title={branchId ? "Branch" : "Create Branch"}
        canRead={canRead}
        adapter={adapter}
        onBack={onBack}
      />
    );
  if (!canManage)
    return branchId ? (
      <BranchReadOnly adapter={adapter} id={branchId} onBack={onBack} />
    ) : (
      <SettingsFrame title="Create Branch" onBack={onBack}>
        <ReadOnlyNotice />
      </SettingsFrame>
    );
  return <BranchFormContent adapter={adapter} branchId={branchId} onBack={onBack} />;
}
function BranchFormContent({
  adapter,
  branchId,
  onBack,
}: {
  adapter: SettingsAdapter;
  branchId?: string;
  onBack: () => void;
}) {
  const load = useCallback(
    async () => ({
      branch: branchId ? await adapter.getBranch(branchId) : null,
      locations: await adapter.listInventoryLocationOptions(),
    }),
    [adapter, branchId],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={branchId ? "Branch details" : "Create Branch"} onBack={onBack}>
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {({ branch, locations }) => (
          <>
            <BranchForm
              mode={branch ? "edit" : "create"}
              initial={branch ?? undefined}
              locationOptions={locations}
              onSave={(draft) => saveBranch(adapter, branch, draft)}
            />
            {branch ? (
              <LifecycleActions
                status={branch.status}
                noun="Branch"
                onChange={(status) => adapter.setBranchStatus(branch.id, status)}
              />
            ) : null}
          </>
        )}
      </SettingsAsync>
    </SettingsFrame>
  );
}
function BranchReadOnly({
  adapter,
  id,
  onBack,
}: {
  adapter: SettingsAdapter;
  id: string;
  onBack: () => void;
}) {
  const load = useCallback(() => adapter.getBranch(id), [adapter, id]);
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title="Branch details" onBack={onBack}>
      <ReadOnlyNotice />
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {(v) => <BranchSummary value={v} />}
      </SettingsAsync>
    </SettingsFrame>
  );
}

function saveBranch(
  adapter: SettingsAdapter,
  branch: BranchSettings | null,
  draft: BranchSettingsDraft,
) {
  if (!branch) return adapter.createBranch(draft);
  const update: Omit<BranchSettingsDraft, "code"> = {
    displayName: draft.displayName,
    timezone: draft.timezone,
    address: draft.address,
    contactEmail: draft.contactEmail,
    contactPhone: draft.contactPhone,
    fulfillmentEnabled: draft.fulfillmentEnabled,
    clickAndCollectEnabled: draft.clickAndCollectEnabled,
    defaultInventoryLocationId: draft.defaultInventoryLocationId,
    receiptFooter: draft.receiptFooter,
    eligibleBrandIds: draft.eligibleBrandIds,
    status: draft.status,
  };
  return adapter.updateBranch(branch.id, update);
}

export function InventorySettingsScreen({
  adapter,
  canRead,
  canManage,
  onBack,
  onOpenWarehouse,
  onOpenLocation,
}: BaseProps & { onOpenWarehouse: (id: string) => void; onOpenLocation: (id: string) => void }) {
  if (!canRead || !adapter)
    return (
      <Pending title="Inventory settings" canRead={canRead} adapter={adapter} onBack={onBack} />
    );
  return (
    <InventoryContent
      adapter={adapter}
      canManage={canManage}
      onBack={onBack}
      onOpenWarehouse={onOpenWarehouse}
      onOpenLocation={onOpenLocation}
    />
  );
}
function InventoryContent({
  adapter,
  canManage,
  onBack,
  onOpenWarehouse,
  onOpenLocation,
}: {
  adapter: SettingsAdapter;
  canManage: boolean;
  onBack: () => void;
  onOpenWarehouse: (id: string) => void;
  onOpenLocation: (id: string) => void;
}) {
  const load = useCallback(() => adapter.getInventoryOverview(), [adapter]);
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title="Inventory settings" onBack={onBack}>
      {!canManage ? <ReadOnlyNotice /> : null}
      <Body>
        Warehouse and InventoryLocation are distinct operational concepts. An InventoryLocation
        belongs to exactly one Branch or Warehouse.
      </Body>
      <SettingsAsync
        state={state}
        reload={reload}
        empty={(v) => v.warehouses.length === 0 && v.locations.length === 0}
      >
        {(v) => (
          <>
            <SettingsSection title="Warehouses">
              {v.warehouses.length ? (
                v.warehouses.map((w) => (
                  <EntityRow
                    key={w.id}
                    id={w.id}
                    name={w.displayName}
                    code={w.code}
                    status={w.status}
                    onOpen={onOpenWarehouse}
                  />
                ))
              ) : (
                <Body>No Warehouses yet.</Body>
              )}
            </SettingsSection>
            <SettingsSection title="InventoryLocations">
              {v.locations.length ? (
                v.locations.map((l) => (
                  <PressableRow
                    key={l.id}
                    onPress={() => onOpenLocation(l.id)}
                    testID={`inventory-location-${l.id}`}
                  >
                    <Title>{l.displayName}</Title>
                    <InfoRow
                      label="Parent"
                      value={`${l.parentKind === "branch" ? "Branch" : "Warehouse"} · ${l.parentName}`}
                    />
                    <InfoRow label="Type" value={l.locationType} />
                    <Badge label={l.status} />
                  </PressableRow>
                ))
              ) : (
                <Body>No InventoryLocations yet.</Body>
              )}
            </SettingsSection>
          </>
        )}
      </SettingsAsync>
    </SettingsFrame>
  );
}

export function WarehouseDetailScreen({
  adapter,
  canRead,
  canManage,
  id,
  onBack,
}: BaseProps & { id: string }) {
  return (
    <InventoryDetailScreen
      kind="warehouse"
      adapter={adapter}
      canRead={canRead}
      canManage={canManage}
      id={id}
      onBack={onBack}
    />
  );
}
export function InventoryLocationDetailScreen({
  adapter,
  canRead,
  canManage,
  id,
  onBack,
}: BaseProps & { id: string }) {
  return (
    <InventoryDetailScreen
      kind="location"
      adapter={adapter}
      canRead={canRead}
      canManage={canManage}
      id={id}
      onBack={onBack}
    />
  );
}
function InventoryDetailScreen({
  kind,
  adapter,
  canRead,
  canManage,
  id,
  onBack,
}: BaseProps & { kind: "warehouse" | "location"; id: string }) {
  const title = kind === "warehouse" ? "Warehouse" : "InventoryLocation";
  if (!canRead || !adapter)
    return <Pending title={title} canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <InventoryDetailContent
      kind={kind}
      adapter={adapter}
      canManage={canManage}
      id={id}
      onBack={onBack}
    />
  );
}
function InventoryDetailContent({
  kind,
  adapter,
  canManage,
  id,
  onBack,
}: {
  kind: "warehouse" | "location";
  adapter: SettingsAdapter;
  canManage: boolean;
  id: string;
  onBack: () => void;
}) {
  const load = useCallback(
    () => (kind === "warehouse" ? adapter.getWarehouse(id) : adapter.getInventoryLocation(id)),
    [adapter, id, kind],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame
      title={kind === "warehouse" ? "Warehouse details" : "InventoryLocation details"}
      onBack={onBack}
    >
      {!canManage ? <ReadOnlyNotice /> : null}
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {(value) => (
          <InventoryDetailPanel
            value={value}
            canManage={canManage}
            onSave={(next) =>
              kind === "warehouse"
                ? adapter.updateWarehouse(id, next as WarehouseSettings)
                : adapter.updateInventoryLocation(id, next as InventoryLocationSettings)
            }
          />
        )}
      </SettingsAsync>
    </SettingsFrame>
  );
}

export function RegistersSettingsScreen({
  adapter,
  canRead,
  canManage,
  onBack,
  onOpen,
  onCreate,
  onDevices,
}: BaseProps & { onOpen: (id: string) => void; onCreate: () => void; onDevices: () => void }) {
  if (!canRead || !adapter)
    return (
      <Pending title="Registers & Devices" canRead={canRead} adapter={adapter} onBack={onBack} />
    );
  return (
    <EntityList<RegisterSettings[]>
      title="Registers"
      canManage={canManage}
      createLabel="Create Register"
      load={adapter.listRegisters.bind(adapter)}
      onCreate={onCreate}
      onBack={onBack}
      empty={(items) => items.length === 0}
      before={<PrimaryButton label="View Devices" testID="open-devices" onPress={onDevices} />}
      render={(items) =>
        items.map((item) => (
          <EntityRow
            key={item.id}
            id={item.id}
            name={item.displayName}
            code={item.code}
            status={item.status}
            onOpen={onOpen}
          />
        ))
      }
    />
  );
}

export function RegisterFormScreen({
  adapter,
  canRead,
  canManage,
  registerId,
  onBack,
}: BaseProps & { registerId?: string }) {
  if (!canRead || !adapter)
    return (
      <Pending
        title={registerId ? "Register" : "Create Register"}
        canRead={canRead}
        adapter={adapter}
        onBack={onBack}
      />
    );
  if (!canManage)
    return registerId ? (
      <RegisterReadOnly adapter={adapter} id={registerId} onBack={onBack} />
    ) : (
      <SettingsFrame title="Create Register" onBack={onBack}>
        <ReadOnlyNotice />
      </SettingsFrame>
    );
  return <RegisterFormContent adapter={adapter} registerId={registerId} onBack={onBack} />;
}
function RegisterFormContent({
  adapter,
  registerId,
  onBack,
}: {
  adapter: SettingsAdapter;
  registerId?: string;
  onBack: () => void;
}) {
  const load = useCallback(
    async () => ({
      register: registerId ? await adapter.getRegister(registerId) : null,
      branches: await adapter.listBranchOptions(),
      locations: await adapter.listInventoryLocationOptions(),
    }),
    [adapter, registerId],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={registerId ? "Register details" : "Create Register"} onBack={onBack}>
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {({ register, branches, locations }) => (
          <>
            <RegisterForm
              mode={register ? "edit" : "create"}
              initial={register ?? undefined}
              branchOptions={branches}
              locationOptions={locations}
              onSave={(draft) =>
                register
                  ? adapter.updateRegister(register.id, {
                      displayName: draft.displayName,
                      defaultInventoryLocationId: draft.defaultInventoryLocationId,
                      sellingCurrency: draft.sellingCurrency,
                      status: draft.status,
                    })
                  : adapter.createRegister(draft)
              }
            />
            {register ? (
              <LifecycleActions
                status={register.status}
                noun="Register"
                onChange={(status) => adapter.setRegisterStatus(register.id, status)}
              />
            ) : null}
          </>
        )}
      </SettingsAsync>
    </SettingsFrame>
  );
}

function RegisterReadOnly({
  adapter,
  id,
  onBack,
}: {
  adapter: SettingsAdapter;
  id: string;
  onBack: () => void;
}) {
  const load = useCallback(() => adapter.getRegister(id), [adapter, id]);
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title="Register details" onBack={onBack}>
      <ReadOnlyNotice />
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {(value) => (
          <View style={{ gap: 8 }}>
            <Title>{value.displayName}</Title>
            <InfoRow label="Register code · read-only" value={value.code} />
            <InfoRow label="Branch · read-only" value={value.branchName} />
            <InfoRow
              label="Default InventoryLocation"
              value={value.defaultInventoryLocationId ?? "Not set"}
            />
            <InfoRow label="Selling currency" value={value.sellingCurrency} />
            <Badge label={value.status} />
          </View>
        )}
      </SettingsAsync>
    </SettingsFrame>
  );
}

export function DevicesSettingsScreen({
  adapter,
  canRead,
  canManage,
  onBack,
  onOpen,
}: BaseProps & { onOpen: (id: string) => void }) {
  if (!canRead || !adapter)
    return <Pending title="Devices" canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <EntityList<DeviceSettings[]>
      title="Devices"
      canManage={canManage}
      load={adapter.listDevices.bind(adapter)}
      onBack={onBack}
      empty={(items) => items.length === 0}
      render={(items) =>
        items.map((d) => (
          <PressableRow key={d.id} testID={`device-${d.id}`} onPress={() => onOpen(d.id)}>
            <Title>{d.displayName}</Title>
            <Badge label={d.status} />
            <InfoRow label="Assigned Register" value={d.registerName ?? "Unassigned"} />
          </PressableRow>
        ))
      }
    />
  );
}

export function DeviceDetailScreen({
  adapter,
  canRead,
  canManage,
  id,
  onBack,
}: BaseProps & { id: string }) {
  if (!canRead || !adapter)
    return <Pending title="Device" canRead={canRead} adapter={adapter} onBack={onBack} />;
  return <DeviceDetailContent adapter={adapter} canManage={canManage} id={id} onBack={onBack} />;
}
function DeviceDetailContent({
  adapter,
  canManage,
  id,
  onBack,
}: {
  adapter: SettingsAdapter;
  canManage: boolean;
  id: string;
  onBack: () => void;
}) {
  const load = useCallback(
    async () => ({
      device: await adapter.getDevice(id),
      registers: await adapter.listRegisterOptions(),
    }),
    [adapter, id],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title="Device governance" onBack={onBack}>
      {!canManage ? <ReadOnlyNotice /> : null}
      <Body>
        A Device is a credentialed installation. A Register is the selling station it may be
        assigned to.
      </Body>
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {({ device, registers }) => (
          <DevicePanel
            device={device}
            registers={registers}
            canManage={canManage}
            onAssign={(registerId) => adapter.assignDevice(device.id, registerId)}
            onRevoke={() => adapter.revokeDevice(device.id)}
          />
        )}
      </SettingsAsync>
    </SettingsFrame>
  );
}

export function CommerceSettingsScreen({ adapter, canRead, canManage, onBack }: BaseProps) {
  if (!canRead || !adapter)
    return <Pending title="Commerce" canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <SimpleFormContent
      title="Commerce"
      adapter={adapter}
      canManage={canManage}
      onBack={onBack}
      load={() => adapter.getCommerce()}
      render={(value) => (
        <CommerceForm value={value} onSave={(draft) => adapter.updateCommerce(draft)} />
      )}
      read={(value) => (
        <>
          <SettingsSection title="Storefront">
            <InfoRow label="Brand/context" value={value.storefront.brandId ?? "Not set"} />
            <InfoRow
              label="Fulfillment InventoryLocation"
              value={value.storefront.fulfillmentInventoryLocationId ?? "Not set"}
            />
            <InfoRow label="Currency" value={value.storefront.currency} />
            <InfoRow label="COD" value={value.storefront.codEnabled ? "Enabled" : "Disabled"} />
          </SettingsSection>
          <SettingsSection title="Returns">
            <InfoRow label="Returns" value={value.returns.enabled ? "Enabled" : "Disabled"} />
            <InfoRow label="Window" value={`${value.returns.windowDays} days`} />
            <InfoRow
              label="Manual refunds"
              value={value.returns.manualRefundsEnabled ? "Enabled" : "Disabled"}
            />
            <InfoRow
              label="Maximum manual refund"
              value={
                value.returns.maxManualRefundMinor === null
                  ? "Not set"
                  : String(value.returns.maxManualRefundMinor)
              }
            />
            {value.returns.allowedReasons ? (
              <InfoRow label="Allowed reasons" value={value.returns.allowedReasons.join(", ")} />
            ) : null}
          </SettingsSection>
        </>
      )}
    />
  );
}

export function ReceiptSettingsScreen({ adapter, canRead, canManage, onBack }: BaseProps) {
  if (!canRead || !adapter)
    return <Pending title="Receipt" canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <SimpleFormContent
      title="Receipt"
      adapter={adapter}
      canManage={canManage}
      onBack={onBack}
      load={() => adapter.getReceipt()}
      render={(value) => (
        <ReceiptForm value={value} onSave={(draft) => adapter.updateReceipt(draft)} />
      )}
      read={(value) => (
        <>
          <InfoRow label="Business name" value={value.businessDisplayName} />
          <InfoRow label="Legal name" value={value.legalName} />
          <InfoRow label="Tax identifier" value={value.taxIdentifier} />
          <InfoRow label="Branch address" value={value.branchAddress} />
          <InfoRow label="Branch contact" value={value.branchContact} />
          <InfoRow label="Receipt footer" value={value.footer} />
        </>
      )}
    />
  );
}

interface BaseProps {
  adapter: SettingsAdapter | null;
  canRead: boolean;
  canManage: boolean;
  onBack: () => void;
}
function Pending({
  title,
  canRead,
  adapter,
  onBack,
}: {
  title: string;
  canRead: boolean;
  adapter: SettingsAdapter | null;
  onBack: () => void;
}) {
  return (
    <SettingsUnavailable
      title={title}
      canRead={canRead}
      transportPending={canRead && adapter === null}
      onBack={onBack}
    />
  );
}

function EntityList<T>({
  title,
  canManage,
  createLabel,
  load,
  onCreate,
  onBack,
  empty,
  render,
  before,
}: {
  title: string;
  canManage: boolean;
  createLabel?: string;
  load: () => Promise<T>;
  onCreate?: () => void;
  onBack: () => void;
  empty: (value: T) => boolean;
  render: (value: T) => React.ReactNode;
  before?: React.ReactNode;
}) {
  const producer = useCallback(() => load(), [load]);
  const { state, reload } = useAsync(producer);
  return (
    <SettingsFrame title={title} onBack={onBack}>
      {before}
      {!canManage ? (
        <ReadOnlyNotice />
      ) : createLabel && onCreate ? (
        <PrimaryButton label={createLabel} testID="settings-create" onPress={onCreate} />
      ) : null}
      <SettingsAsync state={state} reload={reload} empty={empty}>
        {(value) => <View style={{ gap: 12 }}>{render(value)}</View>}
      </SettingsAsync>
    </SettingsFrame>
  );
}
function EntityRow({
  id,
  name,
  code,
  status,
  onOpen,
}: {
  id: string;
  name: string;
  code: string;
  status: string;
  onOpen: (id: string) => void;
}) {
  return (
    <PressableRow testID={`settings-row-${id}`} onPress={() => onOpen(id)}>
      <Title>{name}</Title>
      <InfoRow label="Code" value={code} />
      <Badge label={status} />
    </PressableRow>
  );
}
function LifecycleActions({
  status,
  noun,
  onChange,
}: {
  status: string;
  noun: string;
  onChange: (status: "active" | "inactive") => Promise<unknown>;
}) {
  return (
    <SettingsSection title="Lifecycle">
      <Body>Referenced commercial entities are deactivated or archived, never deleted.</Body>
      <ConfirmButton
        label={status === "active" ? `Deactivate ${noun}` : `Reactivate ${noun}`}
        confirmLabel={status === "active" ? "Confirm deactivation" : "Confirm reactivation"}
        testID="settings-lifecycle"
        onConfirm={() => void onChange(status === "active" ? "inactive" : "active")}
      />
    </SettingsSection>
  );
}

function BranchSummary({ value }: { value: BranchSettings }) {
  return (
    <View style={{ gap: 8 }}>
      <Title>{value.displayName}</Title>
      <InfoRow label="Branch code · read-only" value={value.code} />
      <InfoRow label="Timezone" value={value.timezone} />
      <InfoRow label="Address" value={value.address} />
      <InfoRow label="Contact email" value={value.contactEmail} />
      <InfoRow label="Contact phone" value={value.contactPhone} />
      <InfoRow label="Fulfillment" value={value.fulfillmentEnabled ? "Enabled" : "Disabled"} />
      <InfoRow
        label="Click-and-collect"
        value={value.clickAndCollectEnabled ? "Enabled" : "Disabled"}
      />
      <InfoRow
        label="Default InventoryLocation"
        value={value.defaultInventoryLocationId ?? "Not set"}
      />
      <InfoRow label="Receipt footer" value={value.receiptFooter} />
      <Badge label={value.status} />
    </View>
  );
}

function InventoryDetailPanel({
  value,
  canManage,
  onSave,
}: {
  value: WarehouseSettings | InventoryLocationSettings;
  canManage: boolean;
  onSave: (value: WarehouseSettings | InventoryLocationSettings) => Promise<unknown>;
}) {
  const [name, setName] = useState(value.displayName);
  const [capabilities, setCapabilities] = useState(value.capabilities);
  const location = "parentName" in value ? value : null;
  return (
    <View style={{ gap: 12 }}>
      <Title>{value.displayName}</Title>
      <InfoRow label="Code" value={value.code} />
      <Badge label={value.status} />
      {location ? (
        <>
          <InfoRow
            label="Parent · read-only"
            value={`${location.parentKind === "branch" ? "Branch" : "Warehouse"} · ${location.parentName}`}
          />
          <InfoRow label="Location type · read-only" value={location.locationType} />
        </>
      ) : null}
      {canManage ? (
        <>
          <TextField
            label="Display name"
            value={name}
            onChangeText={setName}
            testID="inventory-display-name"
          />
          <CapabilityEditor value={capabilities} onChange={setCapabilities} />
          <PrimaryButton
            label="Save operational capabilities"
            testID="save-inventory-settings"
            onPress={() => void onSave({ ...value, displayName: name, capabilities })}
          />
          <ConfirmButton
            label={value.status === "active" ? "Deactivate" : "Reactivate"}
            confirmLabel="Confirm lifecycle change"
            testID="inventory-lifecycle"
            onConfirm={() =>
              void onSave({ ...value, status: value.status === "active" ? "inactive" : "active" })
            }
          />
        </>
      ) : (
        <CapabilitySummary value={capabilities} />
      )}
    </View>
  );
}
function CapabilityEditor({
  value,
  onChange,
}: {
  value: CapabilityFlags;
  onChange: (value: CapabilityFlags) => void;
}) {
  return (
    <SettingsSection title="Capability flags">
      {(Object.keys(value) as Array<keyof CapabilityFlags>).map((key) => (
        <SelectField
          key={key}
          label={capabilityLabel(key)}
          options={[
            { value: "yes", label: "Enabled" },
            { value: "no", label: "Disabled" },
          ]}
          selected={value[key] ? "yes" : "no"}
          onSelect={(v) => onChange({ ...value, [key]: v === "yes" })}
          testIDPrefix={`capability-${key}`}
        />
      ))}
    </SettingsSection>
  );
}
function CapabilitySummary({ value }: { value: CapabilityFlags }) {
  return (
    <SettingsSection title="Capability flags">
      {(Object.keys(value) as Array<keyof CapabilityFlags>).map((key) => (
        <InfoRow
          key={key}
          label={capabilityLabel(key)}
          value={value[key] ? "Enabled" : "Disabled"}
        />
      ))}
    </SettingsSection>
  );
}
function capabilityLabel(key: keyof CapabilityFlags) {
  return {
    canReceive: "Receive",
    canAdjust: "Adjust",
    canTransferFrom: "Transfer origin",
    canTransferTo: "Transfer destination",
    canFulfill: "Fulfillment",
  }[key];
}

function DevicePanel({
  device,
  registers,
  canManage,
  onAssign,
  onRevoke,
}: {
  device: DeviceSettings;
  registers: SettingsOption[];
  canManage: boolean;
  onAssign: (id: string) => Promise<unknown>;
  onRevoke: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState(device.registerId ?? "");
  return (
    <View style={{ gap: 12 }}>
      <Title>{device.displayName}</Title>
      <Badge label={device.status} />
      <InfoRow label="Current Register" value={device.registerName ?? "Unassigned"} />
      <InfoRow label="Last seen" value={device.lastSeenAt ?? "Never"} />
      {canManage && device.status !== "revoked" ? (
        <>
          <SelectField
            label="Assign/reassign Register"
            options={registers.map((o) => ({ value: o.id, label: o.label }))}
            selected={selected}
            onSelect={setSelected}
            testIDPrefix="device-register"
          />
          <PrimaryButton
            label="Save Register assignment"
            testID="assign-device"
            disabled={!selected}
            onPress={() => void onAssign(selected)}
          />
          <ConfirmButton
            label="Revoke Device"
            confirmLabel="Confirm Device revocation"
            testID="revoke-device"
            onConfirm={() => void onRevoke()}
          />
        </>
      ) : null}
    </View>
  );
}

function SimpleFormContent<T>({
  title,
  canManage,
  onBack,
  load,
  render,
  read,
}: {
  title: string;
  adapter: SettingsAdapter;
  canManage: boolean;
  onBack: () => void;
  load: () => Promise<T>;
  render: (value: T) => React.ReactNode;
  read: (value: T) => React.ReactNode;
}) {
  const producer = useCallback(() => load(), [load]);
  const { state, reload } = useAsync(producer);
  return (
    <SettingsFrame title={title} onBack={onBack}>
      {!canManage ? <ReadOnlyNotice /> : null}
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {(value) => (canManage ? render(value) : read(value))}
      </SettingsAsync>
    </SettingsFrame>
  );
}

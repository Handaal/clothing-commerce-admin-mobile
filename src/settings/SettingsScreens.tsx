import { useCallback, useState } from "react";
import { View } from "react-native";

import { t as translate, useI18n } from "../i18n";
import { tenantDisplayName } from "../tenant/presentation";
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
import { AccessSummary } from "./AccessSummary";
import type { SettingsAdapter } from "./adapter";
import { describeSettingsError } from "./errors";
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
  InventoryLocationCreateForm,
  ReceiptForm,
  RegisterForm,
  WarehouseCreateForm,
} from "./SettingsForms";
import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

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
  context,
  onOpen,
  onBack,
}: {
  canRead: boolean;
  canManage: boolean;
  context?: MeContextResponse;
  onOpen: (section: SettingsSectionKey) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  if (!canRead) return <SettingsUnavailable title={t("set.title")} canRead={false} onBack={onBack} />;
  const sections: Array<{ key: SettingsSectionKey; title: string; description: string }> = [
    {
      key: "business",
      title: t("set.business"),
      description: t("set.businessDesc"),
    },
    { key: "brands", title: t("set.brands"), description: t("set.brandsDesc") },
    {
      key: "branches",
      title: t("set.branches"),
      description: t("set.branchesDesc"),
    },
    { key: "inventory", title: t("set.inventory"), description: t("set.inventoryDesc") },
    {
      key: "registers",
      title: t("set.registersDevices"),
      description: t("set.registersDevicesDesc"),
    },
    {
      key: "commerce",
      title: t("set.commerce"),
      description: t("set.commerceDesc"),
    },
    { key: "receipt", title: t("set.receipt"), description: t("set.receiptDesc") },
  ];
  return (
    <SettingsFrame title={t("set.title")} onBack={onBack}>
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
      {context ? <AccessSummary context={context} /> : null}
    </SettingsFrame>
  );
}

export function BusinessSettingsScreen({ adapter, canRead, canManage, onBack }: BaseProps) {
  const { t } = useI18n();
  if (!canRead || !adapter)
    return <Pending title={t("set.business")} canRead={canRead} adapter={adapter} onBack={onBack} />;
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
  const { t } = useI18n();
  const load = useCallback(() => adapter.getBusiness(), [adapter]);
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={t("set.business")} onBack={onBack}>
      {!canManage ? <ReadOnlyNotice /> : null}
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {(business) =>
          canManage ? (
            <BusinessForm value={business} onSave={(draft) => adapter.updateBusiness(draft)} />
          ) : (
            <View style={{ gap: 8 }}>
              <InfoRow
                label={t("set.displayName")}
                value={tenantDisplayName(business.displayName)}
              />
              <InfoRow label={t("set.legalName")} value={business.legalName} />
              <InfoRow label={t("set.tenantSlugRO")} value={business.slug} />
              <InfoRow label={t("set.contactEmail")} value={business.contactEmail} />
              <InfoRow label={t("set.contactPhone")} value={business.contactPhone} />
              <InfoRow label={t("set.timezone")} value={business.timezone} />
              <InfoRow label={t("set.country")} value={business.country} />
              <InfoRow label={t("set.taxIdentifier")} value={business.taxIdentifier} />
              <InfoRow label={t("set.defaultCurrency")} value={business.defaultCurrency} />
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
  const { t } = useI18n();
  if (!canRead || !adapter)
    return <Pending title={t("set.brands")} canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <EntityList<BrandSettings[]>
      title={t("set.brands")}
      canManage={canManage}
      createLabel={t("set.createBrand")}
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
  const { t } = useI18n();
  if (!canRead || !adapter)
    return (
      <Pending
        title={brandId ? t("set.nounBrand") : t("set.createBrand")}
        canRead={canRead}
        adapter={adapter}
        onBack={onBack}
      />
    );
  if (!canManage)
    return brandId ? (
      <BrandReadOnly adapter={adapter} id={brandId} onBack={onBack} />
    ) : (
      <SettingsFrame title={t("set.createBrand")} onBack={onBack}>
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
  const { t } = useI18n();
  const load = useCallback(
    () => (brandId ? adapter.getBrand(brandId) : Promise.resolve(null)),
    [adapter, brandId],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={brandId ? t("set.brandDetails") : t("set.createBrand")} onBack={onBack}>
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
                noun={t("set.nounBrand")}
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
  const { t } = useI18n();
  const load = useCallback(() => adapter.getBrand(id), [adapter, id]);
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={t("set.brandDetails")} onBack={onBack}>
      <ReadOnlyNotice />
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {(value) => (
          <View style={{ gap: 8 }}>
            <Title>{value.displayName}</Title>
            <InfoRow label={t("set.brandCodeRO")} value={value.code} />
            <InfoRow label={t("set.legalName")} value={value.legalName} />
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
  const { t } = useI18n();
  if (!canRead || !adapter)
    return <Pending title={t("set.branches")} canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <EntityList<BranchSettings[]>
      title={t("set.branches")}
      canManage={canManage}
      createLabel={t("set.createBranch")}
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
  const { t } = useI18n();
  if (!canRead || !adapter)
    return (
      <Pending
        title={branchId ? t("set.nounBranch") : t("set.createBranch")}
        canRead={canRead}
        adapter={adapter}
        onBack={onBack}
      />
    );
  if (!canManage)
    return branchId ? (
      <BranchReadOnly adapter={adapter} id={branchId} onBack={onBack} />
    ) : (
      <SettingsFrame title={t("set.createBranch")} onBack={onBack}>
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
  const { t } = useI18n();
  const load = useCallback(
    async () => ({
      branch: branchId ? await adapter.getBranch(branchId) : null,
      locations: await adapter.listInventoryLocationOptions(),
      brands: await adapter.listBrandOptions(),
    }),
    [adapter, branchId],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={branchId ? t("set.branchDetails") : t("set.createBranch")} onBack={onBack}>
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {({ branch, locations, brands }) => (
          <>
            <BranchForm
              mode={branch ? "edit" : "create"}
              initial={branch ?? undefined}
              locationOptions={locations}
              brandOptions={brands}
              onSave={(draft) => saveBranch(adapter, branch, draft)}
            />
            {branch ? (
              <LifecycleActions
                status={branch.status}
                noun={t("set.nounBranch")}
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
  const { t } = useI18n();
  const load = useCallback(() => adapter.getBranch(id), [adapter, id]);
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={t("set.branchDetails")} onBack={onBack}>
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
    addressLine1: draft.addressLine1,
    addressLine2: draft.addressLine2,
    city: draft.city,
    region: draft.region,
    postalCode: draft.postalCode,
    countryCode: draft.countryCode,
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
  onCreateWarehouse,
  onCreateLocation,
}: BaseProps & {
  onOpenWarehouse: (id: string) => void;
  onOpenLocation: (id: string) => void;
  onCreateWarehouse?: () => void;
  onCreateLocation?: () => void;
}) {
  const { t } = useI18n();
  if (!canRead || !adapter)
    return (
      <Pending title={t("set.inventorySettings")} canRead={canRead} adapter={adapter} onBack={onBack} />
    );
  return (
    <InventoryContent
      adapter={adapter}
      canManage={canManage}
      onBack={onBack}
      onOpenWarehouse={onOpenWarehouse}
      onOpenLocation={onOpenLocation}
      onCreateWarehouse={onCreateWarehouse}
      onCreateLocation={onCreateLocation}
    />
  );
}
function InventoryContent({
  adapter,
  canManage,
  onBack,
  onOpenWarehouse,
  onOpenLocation,
  onCreateWarehouse,
  onCreateLocation,
}: {
  adapter: SettingsAdapter;
  canManage: boolean;
  onBack: () => void;
  onOpenWarehouse: (id: string) => void;
  onOpenLocation: (id: string) => void;
  onCreateWarehouse?: () => void;
  onCreateLocation?: () => void;
}) {
  const { t } = useI18n();
  const load = useCallback(() => adapter.getInventoryOverview(), [adapter]);
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={t("set.inventorySettings")} onBack={onBack}>
      {!canManage ? <ReadOnlyNotice /> : null}
      <Body>{t("set.inventoryIntro")}</Body>
      <SettingsAsync
        state={state}
        reload={reload}
        empty={(v) => v.warehouses.length === 0 && v.locations.length === 0}
      >
        {(v) => (
          <>
            <SettingsSection title={t("set.warehouses")}>
              {canManage && onCreateWarehouse ? (
                <PrimaryButton
                  label={t("set.createWarehouse")}
                  testID="create-warehouse"
                  onPress={onCreateWarehouse}
                />
              ) : null}
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
                <Body>{t("set.noWarehouses")}</Body>
              )}
            </SettingsSection>
            <SettingsSection title={t("set.inventoryLocations")}>
              {canManage && onCreateLocation ? (
                <PrimaryButton
                  label={t("set.createInvLocation")}
                  testID="create-location"
                  onPress={onCreateLocation}
                />
              ) : null}
              {v.locations.length ? (
                v.locations.map((l) => (
                  <PressableRow
                    key={l.id}
                    onPress={() => onOpenLocation(l.id)}
                    testID={`inventory-location-${l.id}`}
                  >
                    <Title>{l.displayName}</Title>
                    <InfoRow
                      label={t("set.parent")}
                      value={
                        l.parentKind === "branch"
                          ? t("set.branchDot", { label: l.parentName })
                          : t("set.warehouseDot", { label: l.parentName })
                      }
                    />
                    <InfoRow label={t("set.type")} value={l.locationType} />
                    <Badge label={l.status} />
                  </PressableRow>
                ))
              ) : (
                <Body>{t("set.noInventoryLocations")}</Body>
              )}
            </SettingsSection>
          </>
        )}
      </SettingsAsync>
    </SettingsFrame>
  );
}

export function WarehouseCreateScreen({ adapter, canRead, canManage, onBack }: BaseProps) {
  const { t } = useI18n();
  if (!canRead || !adapter)
    return <Pending title={t("set.createWarehouse")} canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <SettingsFrame title={t("set.createWarehouse")} onBack={onBack}>
      {canManage ? (
        <WarehouseCreateForm onSave={(draft) => adapter.createWarehouse(draft)} />
      ) : (
        <ReadOnlyNotice />
      )}
    </SettingsFrame>
  );
}

export function InventoryLocationCreateScreen({ adapter, canRead, canManage, onBack }: BaseProps) {
  const { t } = useI18n();
  if (!canRead || !adapter)
    return (
      <Pending
        title={t("set.createInvLocation")}
        canRead={canRead}
        adapter={adapter}
        onBack={onBack}
      />
    );
  return <InventoryLocationCreateContent adapter={adapter} canManage={canManage} onBack={onBack} />;
}

function InventoryLocationCreateContent({
  adapter,
  canManage,
  onBack,
}: {
  adapter: SettingsAdapter;
  canManage: boolean;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const load = useCallback(
    async () => ({
      branches: await adapter.listBranchOptions(),
      warehouses: await adapter.listWarehouseOptions(),
    }),
    [adapter],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={t("set.createInvLocation")} onBack={onBack}>
      {!canManage ? <ReadOnlyNotice /> : null}
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {({ branches, warehouses }) =>
          canManage ? (
            <InventoryLocationCreateForm
              branchOptions={branches}
              warehouseOptions={warehouses}
              onSave={(draft) => adapter.createInventoryLocation(draft)}
            />
          ) : null
        }
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
  const { t } = useI18n();
  const title = kind === "warehouse" ? t("set.warehouse") : t("set.inventoryLocation");
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
  const { t } = useI18n();
  const load = useCallback<() => Promise<WarehouseSettings | InventoryLocationSettings>>(
    () => (kind === "warehouse" ? adapter.getWarehouse(id) : adapter.getInventoryLocation(id)),
    [adapter, id, kind],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame
      title={kind === "warehouse" ? t("set.warehouseDetails") : t("set.invLocationDetails")}
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
  const { t } = useI18n();
  if (!canRead || !adapter)
    return (
      <Pending title={t("set.registersDevices")} canRead={canRead} adapter={adapter} onBack={onBack} />
    );
  return (
    <EntityList<RegisterSettings[]>
      title={t("set.registers")}
      canManage={canManage}
      createLabel={t("set.createRegister")}
      load={adapter.listRegisters.bind(adapter)}
      onCreate={onCreate}
      onBack={onBack}
      empty={(items) => items.length === 0}
      before={<PrimaryButton label={t("set.viewDevices")} testID="open-devices" onPress={onDevices} />}
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
  const { t } = useI18n();
  if (!canRead || !adapter)
    return (
      <Pending
        title={registerId ? t("set.nounRegister") : t("set.createRegister")}
        canRead={canRead}
        adapter={adapter}
        onBack={onBack}
      />
    );
  if (!canManage)
    return registerId ? (
      <RegisterReadOnly adapter={adapter} id={registerId} onBack={onBack} />
    ) : (
      <SettingsFrame title={t("set.createRegister")} onBack={onBack}>
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
  const { t } = useI18n();
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
    <SettingsFrame title={registerId ? t("set.registerDetails") : t("set.createRegister")} onBack={onBack}>
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
                noun={t("set.nounRegister")}
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
  const { t } = useI18n();
  const load = useCallback(() => adapter.getRegister(id), [adapter, id]);
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={t("set.registerDetails")} onBack={onBack}>
      <ReadOnlyNotice />
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {(value) => (
          <View style={{ gap: 8 }}>
            <Title>{value.displayName}</Title>
            <InfoRow label={t("set.registerCodeRO")} value={value.code} />
            <InfoRow label={t("set.branchRO")} value={value.branchName} />
            <InfoRow
              label={t("set.defaultInvLocation")}
              value={value.defaultInventoryLocationId ?? t("set.notSet")}
            />
            <InfoRow label={t("set.sellingCurrency")} value={value.sellingCurrency} />
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
  const { t } = useI18n();
  if (!canRead || !adapter)
    return <Pending title={t("set.devices")} canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <EntityList<DeviceSettings[]>
      title={t("set.devices")}
      canManage={canManage}
      load={adapter.listDevices.bind(adapter)}
      onBack={onBack}
      empty={(items) => items.length === 0}
      render={(items) =>
        items.map((d) => (
          <PressableRow key={d.id} testID={`device-${d.id}`} onPress={() => onOpen(d.id)}>
            <Title>{d.displayName}</Title>
            <Badge label={d.status} />
            <InfoRow label={t("set.assignedRegister")} value={d.registerName ?? t("set.unassigned")} />
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
  const { t } = useI18n();
  if (!canRead || !adapter)
    return <Pending title={t("set.device")} canRead={canRead} adapter={adapter} onBack={onBack} />;
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
  const { t } = useI18n();
  const load = useCallback(
    async () => ({
      device: await adapter.getDevice(id),
      registers: await adapter.listRegisterOptions(),
    }),
    [adapter, id],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={t("set.deviceGovernance")} onBack={onBack}>
      {!canManage ? <ReadOnlyNotice /> : null}
      <Body>{t("set.deviceIntro")}</Body>
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
  const { t } = useI18n();
  if (!canRead || !adapter)
    return <Pending title={t("set.commerce")} canRead={canRead} adapter={adapter} onBack={onBack} />;
  return <CommerceSettingsContent adapter={adapter} canManage={canManage} onBack={onBack} />;
}

function CommerceSettingsContent({
  adapter,
  canManage,
  onBack,
}: {
  adapter: SettingsAdapter;
  canManage: boolean;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const load = useCallback(
    async () => ({
      value: await adapter.getCommerce(),
      brands: await adapter.listBrandOptions(),
      locations: await adapter.listInventoryLocationOptions(),
    }),
    [adapter],
  );
  const { state, reload } = useAsync(load);
  return (
    <SettingsFrame title={t("set.commerce")} onBack={onBack}>
      {!canManage ? <ReadOnlyNotice /> : null}
      <SettingsAsync state={state} reload={reload} empty={() => false}>
        {({ value, brands, locations }) =>
          canManage ? (
            <CommerceForm
              value={value}
              brandOptions={brands}
              locationOptions={locations}
              onSave={(draft) => adapter.updateCommerce(draft)}
            />
          ) : (
            <>
              <SettingsSection title={t("set.storefront")}>
                {value.storefronts.length ? (
                  value.storefronts.map((storefront) => (
                    <View key={storefront.brandId} style={{ gap: 6 }}>
                      <InfoRow label={t("set.brandContext")} value={storefront.brandName} />
                      <InfoRow
                        label={t("set.fulfillmentInvLocation")}
                        value={storefront.fulfillmentInventoryLocationId}
                      />
                      <InfoRow label={t("set.currency")} value={storefront.currency} />
                      <InfoRow label={t("set.codShort")} value={storefront.codEnabled ? t("set.enabled") : t("set.disabled")} />
                    </View>
                  ))
                ) : (
                  <Body>{t("set.noStorefront")}</Body>
                )}
              </SettingsSection>
              <SettingsSection title={t("set.returns")}>
                <InfoRow label={t("set.returns")} value={value.returns.enabled ? t("set.enabled") : t("set.disabled")} />
                <InfoRow
                  label={t("set.window")}
                  value={
                    value.returns.windowDays === null
                      ? t("set.notSet")
                      : t("set.daysValue", { days: value.returns.windowDays })
                  }
                />
                <InfoRow
                  label={t("set.manualRefunds")}
                  value={value.returns.manualRefundsEnabled ? t("set.enabled") : t("set.disabled")}
                />
                <InfoRow
                  label={t("set.maxManualRefundShort")}
                  value={
                    value.returns.maxManualRefundMinor === null
                      ? t("set.notSet")
                      : String(value.returns.maxManualRefundMinor)
                  }
                />
                {value.returns.allowedReasons ? (
                  <InfoRow
                    label={t("set.allowedReasonsShort")}
                    value={value.returns.allowedReasons.join(", ")}
                  />
                ) : null}
              </SettingsSection>
            </>
          )
        }
      </SettingsAsync>
    </SettingsFrame>
  );
}

export function ReceiptSettingsScreen({ adapter, canRead, canManage, onBack }: BaseProps) {
  const { t } = useI18n();
  if (!canRead || !adapter)
    return <Pending title={t("set.receipt")} canRead={canRead} adapter={adapter} onBack={onBack} />;
  return (
    <SimpleFormContent
      title={t("set.receipt")}
      adapter={adapter}
      canManage={canManage}
      onBack={onBack}
      load={async () => ({
        receipt: await adapter.getReceipt(),
        branches: await adapter.listBranchOptions(),
      })}
      render={({ receipt, branches }) => (
        <ReceiptForm
          value={receipt}
          branchOptions={branches}
          onBranchChange={(branchId) => adapter.getReceipt(branchId)}
          onSave={(draft) => adapter.updateReceipt(draft)}
        />
      )}
      read={({ receipt: value }) => (
        <>
          <InfoRow
            label={t("set.businessName")}
            value={tenantDisplayName(value.businessDisplayName)}
          />
          <InfoRow label={t("set.legalName")} value={value.legalName} />
          <InfoRow label={t("set.taxIdentifier")} value={value.taxIdentifier} />
          <InfoRow label={t("set.branchAddress")} value={value.branchAddressLine1} />
          <InfoRow label={t("set.branchContact")} value={value.branchContactPhone} />
          <InfoRow label={t("set.receiptFooter")} value={value.footer} />
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
  adapter: _adapter,
  onBack,
}: {
  title: string;
  canRead: boolean;
  adapter: SettingsAdapter | null;
  onBack: () => void;
}) {
  void _adapter;
  return <SettingsUnavailable title={title} canRead={canRead} onBack={onBack} />;
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
  const { t } = useI18n();
  return (
    <PressableRow testID={`settings-row-${id}`} onPress={() => onOpen(id)}>
      <Title>{name}</Title>
      <InfoRow label={t("set.code")} value={code} />
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
  const { t } = useI18n();
  const [action, setAction] = useState<ActionState>({ status: "idle" });
  return (
    <SettingsSection title={t("set.lifecycle")}>
      <Body>{t("set.lifecycleNote")}</Body>
      <ConfirmButton
        label={status === "active" ? t("set.deactivateNoun", { noun }) : t("set.reactivateNoun", { noun })}
        confirmLabel={status === "active" ? t("set.confirmDeactivation") : t("set.confirmReactivation")}
        testID="settings-lifecycle"
        disabled={action.status === "saving"}
        onConfirm={() =>
          void runAction(onChange(status === "active" ? "inactive" : "active"), setAction)
        }
      />
      <ActionFeedback state={action} />
    </SettingsSection>
  );
}

function BranchSummary({ value }: { value: BranchSettings }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 8 }}>
      <Title>{value.displayName}</Title>
      <InfoRow label={t("set.branchCodeRO")} value={value.code} />
      <InfoRow label={t("set.timezone")} value={value.timezone} />
      <InfoRow label={t("set.address")} value={value.address} />
      <InfoRow label={t("set.contactEmail")} value={value.contactEmail} />
      <InfoRow label={t("set.contactPhone")} value={value.contactPhone} />
      <InfoRow label={t("set.fulfillment")} value={value.fulfillmentEnabled ? t("set.enabled") : t("set.disabled")} />
      <InfoRow
        label={t("set.clickCollect")}
        value={value.clickAndCollectEnabled ? t("set.enabled") : t("set.disabled")}
      />
      <InfoRow
        label={t("set.defaultInvLocation")}
        value={value.defaultInventoryLocationId ?? t("set.notSet")}
      />
      <InfoRow label={t("set.receiptFooter")} value={value.receiptFooter} />
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
  const { t } = useI18n();
  const [name, setName] = useState(value.displayName);
  const [capabilities, setCapabilities] = useState(value.capabilities);
  const [action, setAction] = useState<ActionState>({ status: "idle" });
  const location = "parentName" in value ? value : null;
  const warehouse = "timezone" in value ? value : null;
  const [warehouseFields, setWarehouseFields] = useState(() =>
    warehouse
      ? {
          timezone: warehouse.timezone,
          addressLine1: warehouse.addressLine1,
          addressLine2: warehouse.addressLine2,
          city: warehouse.city,
          region: warehouse.region,
          postalCode: warehouse.postalCode,
          countryCode: warehouse.countryCode,
          contactEmail: warehouse.contactEmail,
          contactPhone: warehouse.contactPhone,
        }
      : null,
  );
  return (
    <View style={{ gap: 12 }}>
      <Title>{value.displayName}</Title>
      <InfoRow label={t("set.code")} value={value.code} />
      <Badge label={value.status} />
      {location ? (
        <>
          <InfoRow
            label={t("set.parentRO")}
            value={
              location.parentKind === "branch"
                ? t("set.branchDot", { label: location.parentName })
                : t("set.warehouseDot", { label: location.parentName })
            }
          />
          <InfoRow label={t("set.locationTypeRO")} value={location.locationType} />
        </>
      ) : null}
      {warehouse && !canManage ? (
        <>
          <InfoRow label={t("set.timezone")} value={warehouse.timezone} />
          <InfoRow label={t("set.address")} value={warehouse.addressLine1} />
          <InfoRow label={t("set.contactEmail")} value={warehouse.contactEmail} />
          <InfoRow label={t("set.contactPhone")} value={warehouse.contactPhone} />
        </>
      ) : null}
      {canManage ? (
        <>
          <TextField
            label={t("set.displayName")}
            value={name}
            onChangeText={setName}
            testID="inventory-display-name"
          />
          {warehouseFields ? (
            <>
              <TextField
                label={t("set.timezone")}
                value={warehouseFields.timezone}
                onChangeText={(timezone) => setWarehouseFields({ ...warehouseFields, timezone })}
              />
              <TextField
                label={t("set.addressLine1")}
                value={warehouseFields.addressLine1}
                onChangeText={(addressLine1) =>
                  setWarehouseFields({ ...warehouseFields, addressLine1 })
                }
              />
              <TextField
                label={t("set.addressLine2")}
                value={warehouseFields.addressLine2}
                onChangeText={(addressLine2) =>
                  setWarehouseFields({ ...warehouseFields, addressLine2 })
                }
              />
              <TextField
                label={t("set.city")}
                value={warehouseFields.city}
                onChangeText={(city) => setWarehouseFields({ ...warehouseFields, city })}
              />
              <TextField
                label={t("set.region")}
                value={warehouseFields.region}
                onChangeText={(region) => setWarehouseFields({ ...warehouseFields, region })}
              />
              <TextField
                label={t("set.postalCode")}
                value={warehouseFields.postalCode}
                onChangeText={(postalCode) =>
                  setWarehouseFields({ ...warehouseFields, postalCode })
                }
              />
              <TextField
                label={t("set.countryCode")}
                value={warehouseFields.countryCode}
                onChangeText={(countryCode) =>
                  setWarehouseFields({ ...warehouseFields, countryCode: countryCode.toUpperCase() })
                }
              />
              <TextField
                label={t("set.contactEmail")}
                value={warehouseFields.contactEmail}
                onChangeText={(contactEmail) =>
                  setWarehouseFields({ ...warehouseFields, contactEmail })
                }
                autoCapitalize="none"
              />
              <TextField
                label={t("set.contactPhone")}
                value={warehouseFields.contactPhone}
                onChangeText={(contactPhone) =>
                  setWarehouseFields({ ...warehouseFields, contactPhone })
                }
              />
            </>
          ) : null}
          <CapabilityEditor value={capabilities} onChange={setCapabilities} />
          <PrimaryButton
            label={t("set.saveOperationalCapabilities")}
            testID="save-inventory-settings"
            disabled={action.status === "saving"}
            onPress={() =>
              void runAction(
                onSave({
                  ...value,
                  ...(warehouseFields ?? {}),
                  displayName: name,
                  capabilities,
                }),
                setAction,
              )
            }
          />
          <ConfirmButton
            label={value.status === "active" ? t("set.deactivate") : t("set.reactivate")}
            confirmLabel={t("set.confirmLifecycle")}
            testID="inventory-lifecycle"
            disabled={action.status === "saving"}
            onConfirm={() =>
              void runAction(
                onSave({
                  ...value,
                  status: value.status === "active" ? "inactive" : "active",
                }),
                setAction,
              )
            }
          />
          <ActionFeedback state={action} />
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
  const { t } = useI18n();
  return (
    <SettingsSection title={t("set.capabilityFlags")}>
      {(Object.keys(value) as Array<keyof CapabilityFlags>)
        .filter((key) => value[key] !== undefined)
        .map((key) => (
          <SelectField
            key={key}
            label={capabilityLabel(key)}
            options={[
              { value: "yes", label: t("set.enabled") },
              { value: "no", label: t("set.disabled") },
            ]}
            selected={value[key] === true ? "yes" : "no"}
            onSelect={(v) => onChange({ ...value, [key]: v === "yes" })}
            testIDPrefix={`capability-${key}`}
          />
        ))}
    </SettingsSection>
  );
}
function CapabilitySummary({ value }: { value: CapabilityFlags }) {
  const { t } = useI18n();
  return (
    <SettingsSection title={t("set.capabilityFlags")}>
      {(Object.keys(value) as Array<keyof CapabilityFlags>)
        .filter((key) => value[key] !== undefined)
        .map((key) => (
          <InfoRow
            key={key}
            label={capabilityLabel(key)}
            value={value[key] === true ? t("set.enabled") : t("set.disabled")}
          />
        ))}
    </SettingsSection>
  );
}
function capabilityLabel(key: keyof CapabilityFlags) {
  return {
    sellable: translate("set.capSellable"),
    receiving: translate("set.capReceiving"),
    transferOrigin: translate("set.capTransferOrigin"),
    transferDestination: translate("set.capTransferDestination"),
    fulfillment: translate("set.fulfillment"),
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
  const { t } = useI18n();
  const [selected, setSelected] = useState(device.registerId ?? "");
  const [action, setAction] = useState<ActionState>({ status: "idle" });
  return (
    <View style={{ gap: 12 }}>
      <Title>{device.displayName}</Title>
      <Badge label={device.status} />
      <InfoRow label={t("set.installation")} value={device.installationId} />
      <InfoRow label={t("set.deviceType")} value={device.deviceType} />
      <InfoRow label={t("set.platform")} value={device.platform ?? t("set.notReported")} />
      <InfoRow label={t("set.osVersion")} value={device.osVersion ?? t("set.notReported")} />
      <InfoRow label={t("set.clientVersion")} value={device.clientVersion ?? t("set.notReported")} />
      <InfoRow label={t("set.currentRegister")} value={device.registerName ?? t("set.unassigned")} />
      <InfoRow label={t("set.lastSeen")} value={device.lastSeenAt ?? t("set.never")} />
      {canManage && device.status !== "revoked" ? (
        <>
          <SelectField
            label={t("set.assignReassign")}
            options={registers.map((o) => ({ value: o.id, label: o.label }))}
            selected={selected}
            onSelect={setSelected}
            testIDPrefix="device-register"
          />
          <PrimaryButton
            label={t("set.saveRegisterAssignment")}
            testID="assign-device"
            disabled={!selected || action.status === "saving"}
            onPress={() => void runAction(onAssign(selected), setAction)}
          />
          <ConfirmButton
            label={t("set.revokeDevice")}
            confirmLabel={t("set.confirmDeviceRevocation")}
            testID="revoke-device"
            disabled={action.status === "saving"}
            onConfirm={() => void runAction(onRevoke(), setAction)}
          />
          <ActionFeedback state={action} />
        </>
      ) : null}
    </View>
  );
}

type ActionState = { status: "idle" | "saving" } | { status: "error"; error: unknown };

function ActionFeedback({ state }: { state: ActionState }) {
  if (state.status !== "error") return null;
  const described = describeSettingsError(state.error);
  return (
    <View testID={`settings-action-error-${described.kind}`} style={{ gap: 4 }}>
      <Title>{described.heading}</Title>
      <Body>{described.message}</Body>
    </View>
  );
}

async function runAction(promise: Promise<unknown>, setState: (state: ActionState) => void) {
  setState({ status: "saving" });
  try {
    await promise;
    setState({ status: "idle" });
  } catch (error) {
    setState({ status: "error", error });
  }
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

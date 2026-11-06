import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  EmptyState,
  FilterChips,
  InfoRow,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SearchField,
  SectionHeading,
  Surface,
} from "../ui/components";
import { colors } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import type { SupplierAdapter } from "./adapter";
import { loadAllSuppliers } from "./load";
import type { SupplierSummary } from "./model";
import {
  buildSupplierListQuery,
  EMPTY_SUPPLIER_SEARCH,
  type SupplierListQuery,
  type SupplierSearchState,
  type SupplierStatusFilter,
} from "./search";
import { statusFilterLabel, supplierStatusLabel } from "./status";
import { SupplierUnavailable } from "./SupplierUnavailable";

export interface SuppliersListScreenProps {
  adapter: SupplierAdapter | null;
  canManage: boolean;
  onOpenSupplier: (supplierId: string) => void;
  onCreateSupplier: () => void;
  onBack: () => void;
}

const STATUS_FILTERS: SupplierStatusFilter[] = ["all", "active", "inactive"];

export function SuppliersListScreen({
  adapter,
  canManage,
  onOpenSupplier,
  onCreateSupplier,
  onBack,
}: SuppliersListScreenProps) {
  const { t } = useI18n();
  if (!adapter) {
    return (
      <ScrollScreen>
        <SupplierUnavailable title={t("suppliers.title")} onBack={onBack} />
      </ScrollScreen>
    );
  }
  return (
    <SuppliersListContent
      adapter={adapter}
      canManage={canManage}
      onOpenSupplier={onOpenSupplier}
      onCreateSupplier={onCreateSupplier}
      onBack={onBack}
    />
  );
}

function SuppliersListContent({
  adapter,
  canManage,
  onOpenSupplier,
  onCreateSupplier,
  onBack,
}: SuppliersListScreenProps & { adapter: SupplierAdapter }) {
  const { t } = useI18n();
  const [search, setSearch] = useState<SupplierSearchState>(EMPTY_SUPPLIER_SEARCH);
  const [query, setQuery] = useState<SupplierListQuery>(() =>
    buildSupplierListQuery(EMPTY_SUPPLIER_SEARCH),
  );
  const isFiltered = Object.keys(query).length > 0;
  const load = useCallback(() => loadAllSuppliers(adapter, query), [adapter, query]);
  const { state, reload } = useAsync<SupplierSummary[]>(load);

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("suppliers.eyebrow")}
        title={t("suppliers.title")}
        description={t("suppliers.headerDesc")}
        icon="truck-delivery-outline"
        onBack={onBack}
      />
      <Surface tone="accent">
        <SectionHeading
          title={t("suppliers.workspaceTitle")}
          detail={t("suppliers.managementOnly")}
        />
        <Body>{t("suppliers.workspaceBody")}</Body>
        {canManage ? (
          <PrimaryButton
            label={t("suppliers.addCta")}
            icon="account-plus-outline"
            testID="create-supplier"
            onPress={onCreateSupplier}
          />
        ) : (
          <Notice testID="suppliers-read-only" message={t("suppliers.readOnly")} />
        )}
      </Surface>
      <Surface>
        <SearchField
          value={search.term}
          onChangeText={(term) => setSearch((current) => ({ ...current, term }))}
          placeholder={t("suppliers.searchPlaceholder")}
          testID="supplier-search-term"
        />
        <FilterChips
          options={STATUS_FILTERS.map((value) => ({
            value,
            label: statusFilterLabel(value),
            icon:
              value === "active"
                ? "check-circle-outline"
                : value === "inactive"
                  ? "pause-circle-outline"
                  : "view-grid-outline",
          }))}
          selected={search.status}
          onSelect={(status) => setSearch((current) => ({ ...current, status }))}
          testIDPrefix="supplier-status-filter"
        />
        <PrimaryButton
          label={t("suppliers.searchCta")}
          icon="magnify"
          testID="supplier-search-submit"
          onPress={() => setQuery(buildSupplierListQuery(search))}
        />
      </Surface>
      {state.status === "loading" ? <LoadingBlock label={t("suppliers.loading")} /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <View testID="supplier-empty">
          <EmptyState
            icon="truck-outline"
            title={isFiltered ? t("suppliers.emptyFilteredTitle") : t("suppliers.emptyTitle")}
            message={isFiltered ? t("suppliers.emptyFilteredBody") : t("suppliers.emptyBody")}
          />
        </View>
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <MetricCard
              label={t("suppliers.loadedSuppliers")}
              value={String(state.data.length)}
              icon="truck-outline"
            />
            <MetricCard
              label={t("suppliers.activeMetric")}
              value={String(state.data.filter((supplier) => supplier.status === "active").length)}
              icon="check-circle-outline"
              tone="accent"
            />
          </View>
          <SectionHeading
            title={t("suppliers.directory")}
            detail={t("suppliers.loaded", { count: state.data.length })}
          />
          <View style={{ gap: 12 }}>
            {state.data.map((supplier) => (
              <SupplierRow
                key={supplier.id}
                supplier={supplier}
                onOpen={() => onOpenSupplier(supplier.id)}
              />
            ))}
          </View>
        </>
      ) : null}
    </ScrollScreen>
  );
}

function SupplierRow({ supplier, onOpen }: { supplier: SupplierSummary; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <PressableRow testID={`supplier-row-${supplier.id}`} onPress={onOpen}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Text style={{ flex: 1, color: colors.ink, fontSize: 18, fontWeight: "800" }}>
          {supplier.name}
        </Text>
        <Badge
          label={supplierStatusLabel(supplier.status)}
          tone={supplier.status === "active" ? "success" : "neutral"}
          testID={`supplier-status-${supplier.id}`}
        />
      </View>
      {supplier.referenceCode ? (
        <InfoRow label={t("suppliers.reference")} value={supplier.referenceCode} />
      ) : null}
      {supplier.contactPerson ? (
        <InfoRow label={t("suppliers.contact")} value={supplier.contactPerson} />
      ) : null}
      {supplier.phone ? <InfoRow label={t("suppliers.phone")} value={supplier.phone} /> : null}
      {supplier.status === "inactive" ? <Body>{t("suppliers.inactiveTag")}</Body> : null}
    </PressableRow>
  );
}

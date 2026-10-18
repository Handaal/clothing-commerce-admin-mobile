import { useCallback, useState } from "react";
import { Text, View } from "react-native";

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
  if (!adapter) {
    return (
      <ScrollScreen>
        <SupplierUnavailable title="Suppliers" onBack={onBack} />
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
        eyebrow="Partners"
        title="Suppliers"
        description="Manage supplier records and review canonical receiving history."
        icon="truck-delivery-outline"
        onBack={onBack}
      />
      <Surface tone="accent">
        <SectionHeading title="Supplier workspace" detail="Management only" />
        <Body>
          Supplier status controls future receiving choices while preserving every historical
          receipt.
        </Body>
        {canManage ? (
          <PrimaryButton
            label="Add supplier"
            icon="account-plus-outline"
            testID="create-supplier"
            onPress={onCreateSupplier}
          />
        ) : (
          <Notice
            testID="suppliers-read-only"
            message="Read-only access · supplier management actions are hidden."
          />
        )}
      </Surface>
      <Surface>
        <SearchField
          value={search.term}
          onChangeText={(term) => setSearch((current) => ({ ...current, term }))}
          placeholder="Name, reference, phone or email"
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
          label="Search suppliers"
          icon="magnify"
          testID="supplier-search-submit"
          onPress={() => setQuery(buildSupplierListQuery(search))}
        />
      </Surface>
      {state.status === "loading" ? <LoadingBlock label="Loading suppliers…" /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label="Try again" icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <View testID="supplier-empty">
          <EmptyState
            icon="truck-outline"
            title={isFiltered ? "No matching suppliers" : "Your supplier directory is empty"}
            message={
              isFiltered
                ? "No suppliers match your search."
                : "No suppliers yet. Add your first supplier to get started."
            }
          />
        </View>
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <MetricCard
              label="Loaded suppliers"
              value={String(state.data.length)}
              icon="truck-outline"
            />
            <MetricCard
              label="Active"
              value={String(state.data.filter((supplier) => supplier.status === "active").length)}
              icon="check-circle-outline"
              tone="accent"
            />
          </View>
          <SectionHeading title="Supplier directory" detail={`${state.data.length} loaded`} />
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
          testID={`supplier-status-${supplier.id}`}
        />
      </View>
      {supplier.referenceCode ? <InfoRow label="Reference" value={supplier.referenceCode} /> : null}
      {supplier.contactPerson ? <InfoRow label="Contact" value={supplier.contactPerson} /> : null}
      {supplier.phone ? <InfoRow label="Phone" value={supplier.phone} /> : null}
      {supplier.status === "inactive" ? <Body>Inactive · retained, not deleted</Body> : null}
    </PressableRow>
  );
}

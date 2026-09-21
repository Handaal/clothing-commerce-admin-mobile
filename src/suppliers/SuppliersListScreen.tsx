import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  type SelectOption,
  TextField,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { SupplierAdapter } from "./adapter";
import { loadAllSuppliers } from "./load";
import type { SupplierSummary } from "./model";
import {
  buildSupplierListQuery,
  EMPTY_SUPPLIER_SEARCH,
  isEmptySupplierSearch,
  type SupplierListQuery,
  type SupplierSearchState,
  type SupplierStatusFilter,
} from "./search";
import { statusFilterLabel, supplierStatusLabel } from "./status";
import { SupplierUnavailable } from "./SupplierUnavailable";

export interface SuppliersListScreenProps {
  /** The Supplier integration seam. `null` renders an explicit unavailable state (tests/safety net). */
  adapter: SupplierAdapter | null;
  /** Server-derived: whether this caller may create suppliers (UX affordance only). */
  canManage: boolean;
  onOpenSupplier: (supplierId: string) => void;
  onCreateSupplier: () => void;
  onBack: () => void;
}

const STATUS_FILTERS: SupplierStatusFilter[] = ["all", "active", "inactive"];

/**
 * Supplier list with server-side search. When no adapter is present (no Supplier API yet), it shows an
 * explicit unavailable state — it NEVER renders fabricated supplier rows. With an adapter, it follows
 * the same read discipline as the other lists: loading / empty / classified-error / populated, and the
 * search/status constraints round-trip to the server (no client-side filtering of a fake dataset).
 */
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
  // Draft search state the user edits, and the committed query the loader actually runs. Committing on
  // an explicit action (not each keystroke) keeps this a server round-trip, never a live local filter.
  const [search, setSearch] = useState<SupplierSearchState>(EMPTY_SUPPLIER_SEARCH);
  const [query, setQuery] = useState<SupplierListQuery>(() =>
    buildSupplierListQuery(EMPTY_SUPPLIER_SEARCH),
  );
  const isFiltered = !isEmptySupplierSearch(search) || Object.keys(query).length > 0;

  const load = useCallback(() => loadAllSuppliers(adapter, query), [adapter, query]);
  const { state, reload } = useAsync<SupplierSummary[]>(load);

  const statusOptions = useMemo<SelectOption[]>(
    () => STATUS_FILTERS.map((value) => ({ value, label: statusFilterLabel(value) })),
    [],
  );

  function applySearch() {
    setQuery(buildSupplierListQuery(search));
  }

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Suppliers" title="Suppliers" onBack={onBack} />
      {/* Create is offered only when /me/context grants supplier management. The API remains the sole
          authority and still authorizes the write — a real 403 surfaces on submit even if shown. */}
      {canManage ? (
        <PrimaryButton label="Add supplier" testID="create-supplier" onPress={onCreateSupplier} />
      ) : null}
      <Divider />

      <TextField
        label="Search"
        value={search.term}
        onChangeText={(term) => setSearch((prev) => ({ ...prev, term }))}
        placeholder="Name, reference, phone or email"
        testID="supplier-search-term"
        autoCapitalize="none"
      />
      <SelectField
        label="Status"
        options={statusOptions}
        selected={search.status}
        onSelect={(value) =>
          setSearch((prev) => ({ ...prev, status: value as SupplierStatusFilter }))
        }
        testIDPrefix="supplier-status-filter"
      />
      <PrimaryButton
        label="Search suppliers"
        testID="supplier-search-submit"
        onPress={applySearch}
      />
      <Divider />

      {state.status === "loading" ? <LoadingBlock label="Loading suppliers…" /> : null}
      {state.status === "error" ? (
        <>
          <Title>{errorHeading(state.error.kind)}</Title>
          <Body>{state.error.message}</Body>
          {isRetryable(state.error.kind) ? (
            <PrimaryButton label="Try again" onPress={reload} />
          ) : null}
        </>
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <Body testID="supplier-empty">
          {isFiltered
            ? "No suppliers match your search."
            : "No suppliers yet. Add your first supplier to get started."}
        </Body>
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <View style={{ gap: 12 }}>
          {state.data.map((supplier) => (
            <SupplierRow
              key={supplier.id}
              supplier={supplier}
              onOpen={() => onOpenSupplier(supplier.id)}
            />
          ))}
        </View>
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
        <Title>{supplier.name}</Title>
        <Badge
          label={supplierStatusLabel(supplier.status)}
          testID={`supplier-status-${supplier.id}`}
        />
      </View>
      {supplier.referenceCode ? <InfoRow label="Reference" value={supplier.referenceCode} /> : null}
      {supplier.contactPerson ? <InfoRow label="Contact" value={supplier.contactPerson} /> : null}
      {supplier.phone ? <InfoRow label="Phone" value={supplier.phone} /> : null}
      {/* Inactive suppliers stay listed — they are retained history, never hidden as if deleted. */}
      {supplier.status === "inactive" ? <Eyebrow>Inactive — retained, not deleted</Eyebrow> : null}
    </PressableRow>
  );
}

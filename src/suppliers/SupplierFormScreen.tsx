import { useCallback } from "react";

import { errorHeading, isRetryable } from "../products/display";
import { type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  Body,
  Divider,
  LoadingBlock,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { SupplierAdapter } from "./adapter";
import type { Supplier } from "./model";
import { SupplierForm, type SupplierFormMode } from "./SupplierForm";
import { SupplierUnavailable } from "./SupplierUnavailable";

export interface SupplierFormScreenProps {
  mode: SupplierFormMode;
  adapter: SupplierAdapter | null;
  /** Edit mode only: which supplier to edit (its current values are loaded via the adapter). */
  supplierId?: string;
  onSaved: (supplier: Supplier) => void;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

/**
 * Gate + data-load wrapper around the reusable {@link SupplierForm}. With no adapter (no Supplier API
 * yet) it renders the unavailable state — so a create/edit URL can NEVER present a working form or a
 * fake success. In edit mode it first loads the supplier through the adapter, then hands the real
 * values to the form.
 */
export function SupplierFormScreen({
  mode,
  adapter,
  supplierId,
  onSaved,
  onBack,
  generateIdempotencyKey,
}: SupplierFormScreenProps) {
  if (!adapter) {
    return (
      <ScrollScreen>
        <SupplierUnavailable
          title={mode === "create" ? "New supplier" : "Edit supplier"}
          onBack={onBack}
        />
      </ScrollScreen>
    );
  }

  if (mode === "create") {
    return (
      <SupplierForm
        mode="create"
        adapter={adapter}
        onSaved={onSaved}
        onBack={onBack}
        generateIdempotencyKey={generateIdempotencyKey}
      />
    );
  }

  return (
    <EditSupplierLoader
      adapter={adapter}
      supplierId={supplierId as string}
      onSaved={onSaved}
      onBack={onBack}
      generateIdempotencyKey={generateIdempotencyKey}
    />
  );
}

function EditSupplierLoader({
  adapter,
  supplierId,
  onSaved,
  onBack,
  generateIdempotencyKey,
}: {
  adapter: SupplierAdapter;
  supplierId: string;
  onSaved: (supplier: Supplier) => void;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}) {
  const load = useCallback(() => adapter.getSupplier(supplierId), [adapter, supplierId]);
  const { state, reload } = useAsync<Supplier>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Suppliers" title="Edit supplier" onBack={onBack} />
        <Divider />
        <LoadingBlock label="Loading supplier…" />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Suppliers" title={errorHeading(state.error.kind)} onBack={onBack} />
        <Divider />
        <Body>{state.error.message}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label="Try again" onPress={reload} />
        ) : null}
      </ScrollScreen>
    );
  }

  return (
    <SupplierForm
      mode="edit"
      adapter={adapter}
      initial={state.data}
      onSaved={onSaved}
      onBack={onBack}
      generateIdempotencyKey={generateIdempotencyKey}
    />
  );
}

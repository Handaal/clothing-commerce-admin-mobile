import { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";

import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  ConfirmButton,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  TextButton,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import type { SupplierAdapter } from "./adapter";
import type { Supplier, SupplierStatus } from "./model";
import { SupplierReceivingHistory } from "./SupplierReceivingHistory";
import { describeSupplierStatus, supplierStatusLabel, supplierStatusToggle } from "./status";
import { SupplierUnavailable } from "./SupplierUnavailable";
import { describeSupplierWriteError } from "./write-errors";

export interface SupplierDetailScreenProps {
  adapter: SupplierAdapter | null;
  supplierId: string;
  /** Server-derived: whether this caller may edit/change the lifecycle of suppliers (UX only). */
  canManage: boolean;
  onBack: () => void;
  onEdit: (supplierId: string) => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

/**
 * Read-and-manage detail for one supplier. With no adapter (no Supplier API yet) it shows the
 * unavailable state. With an adapter it loads the supplier, renders the editable record and its
 * receiving-history section separately, and offers an active/inactive toggle (a confirmed, reversible
 * status change — never a delete). The status change goes through the adapter with an idempotency key.
 */
export function SupplierDetailScreen({
  adapter,
  supplierId,
  canManage,
  onBack,
  onEdit,
  generateIdempotencyKey,
}: SupplierDetailScreenProps) {
  if (!adapter) {
    return (
      <ScrollScreen>
        <SupplierUnavailable title="Supplier" onBack={onBack} />
      </ScrollScreen>
    );
  }
  return (
    <SupplierDetailContent
      adapter={adapter}
      supplierId={supplierId}
      canManage={canManage}
      onBack={onBack}
      onEdit={onEdit}
      generateIdempotencyKey={generateIdempotencyKey}
    />
  );
}

function SupplierDetailContent({
  adapter,
  supplierId,
  canManage,
  onBack,
  onEdit,
  generateIdempotencyKey,
}: SupplierDetailScreenProps & { adapter: SupplierAdapter }) {
  const generateKey = generateIdempotencyKey ?? secureIdempotencyKey;
  const load = useCallback(() => adapter.getSupplier(supplierId), [adapter, supplierId]);
  const { state, reload } = useAsync<Supplier>(load);

  const statusMutation = useMutation<SupplierStatus, Supplier>(
    (status, key) => adapter.setSupplierStatus(supplierId, status, key),
    generateKey,
  );

  // Re-read the authoritative supplier once after a successful status change (the badge and toggle then
  // reflect the server, never a locally assumed value). Runs once per success transition.
  const latestReload = useRef(reload);
  useEffect(() => {
    latestReload.current = reload;
  });
  useEffect(() => {
    if (statusMutation.state.status === "success") latestReload.current();
  }, [statusMutation.state]);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Suppliers" title="Supplier" onBack={onBack} />
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

  const supplier = state.data;
  const toggle = supplierStatusToggle(supplier.status);
  // useMutation already stores a ClassifiedCommerceError — use it directly (never re-classify).
  const submitError = statusMutation.state.status === "error" ? statusMutation.state.error : null;

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Suppliers" title={supplier.name} onBack={onBack} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Badge label={supplierStatusLabel(supplier.status)} testID="supplier-detail-status" />
      </View>
      <Body>{describeSupplierStatus(supplier.status)}</Body>
      {canManage ? (
        <PrimaryButton
          label="Edit supplier"
          testID="supplier-edit"
          onPress={() => onEdit(supplier.id)}
        />
      ) : null}
      <Divider />

      <Eyebrow>Supplier record</Eyebrow>
      {supplier.referenceCode ? <InfoRow label="Reference" value={supplier.referenceCode} /> : null}
      {supplier.contactPerson ? <InfoRow label="Contact" value={supplier.contactPerson} /> : null}
      {supplier.phone ? <InfoRow label="Phone" value={supplier.phone} /> : null}
      {supplier.email ? <InfoRow label="Email" value={supplier.email} /> : null}
      {supplier.address ? <InfoRow label="Address" value={supplier.address} /> : null}
      {supplier.notes ? <InfoRow label="Notes" value={supplier.notes} /> : null}
      {supplier.createdAt ? <InfoRow label="Created" value={supplier.createdAt} /> : null}
      {supplier.updatedAt ? <InfoRow label="Updated" value={supplier.updatedAt} /> : null}
      <InfoRow label="Supplier id" value={supplier.id} />

      {canManage ? (
        <>
          <Divider />
          <Eyebrow>Status</Eyebrow>
          <Body>
            Marking a supplier inactive keeps it and its history; it is never deleted. An inactive
            supplier cannot be chosen for new receipts, but its past receipts remain visible.
          </Body>
          <ConfirmButton
            label={statusMutation.state.status === "submitting" ? "Saving…" : toggle.label}
            confirmLabel={toggle.confirmLabel}
            disabled={statusMutation.state.status === "submitting"}
            testID="supplier-status-toggle"
            onConfirm={() => statusMutation.submit(toggle.next)}
          />
          {submitError ? (
            <StatusError
              described={describeSupplierWriteError(submitError)}
              onRetry={() => statusMutation.retry()}
              onDismiss={() => statusMutation.reset()}
            />
          ) : null}
        </>
      ) : null}

      {/* Historical receiving records — clearly separated from the editable supplier data above. */}
      <SupplierReceivingHistory adapter={adapter} supplierId={supplier.id} />
    </ScrollScreen>
  );
}

function StatusError({
  described,
  onRetry,
  onDismiss,
}: {
  described: ReturnType<typeof describeSupplierWriteError>;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={{ gap: 8 }} testID="supplier-status-error">
      <Title>{described.heading}</Title>
      <Body>{described.message}</Body>
      {described.recovery === "retry" ? (
        <PrimaryButton label="Retry" testID="supplier-status-retry" onPress={onRetry} />
      ) : (
        <TextButton label="Dismiss" onPress={onDismiss} />
      )}
    </View>
  );
}

import type { MeContextResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { loadAllInventory } from "../inventory/load";
import { distinctVariants } from "../inventory/operations";
import { errorHeading, isRetryable } from "../products/display";
import type { SelectOption } from "../ui/components";
import {
  Badge,
  Body,
  ConfirmButton,
  FormSection,
  InfoRow,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  Surface,
  TextButton,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { useToast } from "../ui/Toast";
import { useMutation } from "../ui/useMutation";
import type { SupplierAdapter } from "./adapter";
import { SupplierLedger } from "./SupplierLedger";
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
  /**
   * Optional accounts-payable ledger wiring. When provided, the detail screen renders the supplier's
   * purchases, payments, dues and reminders. `context` supplies the authorized receiving locations and
   * `client` lazily loads purchasable variants. Omitted in contexts without a resolved session (the
   * ledger section is simply not shown).
   */
  context?: MeContextResponse;
  client?: Pick<TenantCommerceClient, "listInventory">;
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
  context,
  client,
}: SupplierDetailScreenProps) {
  const { t } = useI18n();
  if (!adapter) {
    return (
      <ScrollScreen>
        <SupplierUnavailable title={t("supplierDetail.singular")} onBack={onBack} />
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
      context={context}
      client={client}
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
  context,
  client,
}: SupplierDetailScreenProps & { adapter: SupplierAdapter }) {
  const generateKey = generateIdempotencyKey ?? secureIdempotencyKey;
  const { t } = useI18n();
  // Receiving locations the caller may purchase into (restock destinations for a supplier purchase).
  const ledgerLocationOptions = useMemo<SelectOption[]>(
    () =>
      (context?.access.inventory.write.locations ?? [])
        .filter((location) => location.canReceive)
        .map((location) => ({ value: location.id, label: location.name })),
    [context?.access.inventory.write.locations],
  );
  // Lazily load distinct purchasable variants from the authoritative inventory list.
  const loadVariants = useCallback(async (): Promise<SelectOption[]> => {
    if (!client) return [];
    const items = await loadAllInventory(client);
    return distinctVariants(items).map((v) => ({
      value: v.variantId,
      label: `${v.productName} · ${v.sku}`,
    }));
  }, [client]);
  const load = useCallback(() => adapter.getSupplier(supplierId), [adapter, supplierId]);
  const { state, reload } = useAsync<Supplier>(load);

  const toast = useToast();
  const statusMutation = useMutation<SupplierStatus, Supplier>(
    (status, key) => adapter.setSupplierStatus(supplierId, status, key),
    generateKey,
    {
      onSuccess: (supplier) =>
        toast.success(
          t("supplierDetail.statusToast", {
            name: supplier.name,
            status: supplierStatusLabel(supplier.status),
          }),
          { title: t("supplierDetail.updatedToast") },
        ),
      onError: (error) => {
        const described = describeSupplierWriteError(error);
        toast.error(described.message, {
          title: described.heading,
          ...(described.recovery === "retry"
            ? {
                action: {
                  label: t("common.retry"),
                  icon: "refresh" as const,
                  onPress: () => statusMutation.retry(),
                },
              }
            : {}),
        });
      },
    },
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
        <PageHeader
          eyebrow={t("suppliers.title")}
          title={t("supplierDetail.singular")}
          icon="truck-delivery-outline"
          onBack={onBack}
        />
        <LoadingBlock label={t("supplierDetail.loading")} />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("suppliers.title")}
          title={errorHeading(state.error.kind)}
          icon="alert-circle-outline"
          onBack={onBack}
        />
        <Notice
          tone="danger"
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      </ScrollScreen>
    );
  }

  const supplier = state.data;
  const toggle = supplierStatusToggle(supplier.status);
  // useMutation already stores a ClassifiedCommerceError — use it directly (never re-classify).
  const submitError = statusMutation.state.status === "error" ? statusMutation.state.error : null;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("supplierDetail.recordEyebrow")}
        title={supplier.name}
        description={t("supplierDetail.recordDesc")}
        icon="truck-delivery-outline"
        onBack={onBack}
      />
      <Surface tone="brand">
        <Badge
          label={supplierStatusLabel(supplier.status)}
          tone={supplier.status === "active" ? "success" : "neutral"}
          testID="supplier-detail-status"
        />
        <Body>{describeSupplierStatus(supplier.status)}</Body>
      </Surface>
      {canManage ? (
        <Surface>
          <PrimaryButton
            label={t("supplierDetail.editCta")}
            icon="pencil-outline"
            testID="supplier-edit"
            onPress={() => onEdit(supplier.id)}
          />
        </Surface>
      ) : (
        <Notice message={t("suppliers.readOnly")} />
      )}

      <FormSection title={t("supplierDetail.profileSection")} icon="account-box-outline">
        {supplier.referenceCode ? (
          <InfoRow label={t("suppliers.reference")} value={supplier.referenceCode} />
        ) : null}
        {supplier.contactPerson ? (
          <InfoRow label={t("suppliers.contact")} value={supplier.contactPerson} />
        ) : null}
        {supplier.phone ? <InfoRow label={t("suppliers.phone")} value={supplier.phone} /> : null}
        {supplier.email ? <InfoRow label={t("suppliers.email")} value={supplier.email} /> : null}
      </FormSection>
      {supplier.address || supplier.notes ? (
        <FormSection title={t("supplierDetail.addressSection")} icon="map-marker-outline">
          {supplier.address ? (
            <InfoRow label={t("supplierDetail.address")} value={supplier.address} />
          ) : null}
          {supplier.notes ? (
            <InfoRow label={t("supplierDetail.notes")} value={supplier.notes} />
          ) : null}
        </FormSection>
      ) : null}
      {supplier.createdAt || supplier.updatedAt ? (
        <FormSection title={t("supplierDetail.timelineSection")} icon="clock-outline">
          {supplier.createdAt ? (
            <InfoRow label={t("supplierDetail.created")} value={supplier.createdAt} />
          ) : null}
          {supplier.updatedAt ? (
            <InfoRow label={t("supplierDetail.updated")} value={supplier.updatedAt} />
          ) : null}
        </FormSection>
      ) : null}

      {canManage ? (
        <FormSection title={t("supplierDetail.lifecycleSection")} icon="sync">
          <Body>{t("supplierDetail.lifecycleBody")}</Body>
          <ConfirmButton
            label={statusMutation.state.status === "submitting" ? t("common.saving") : toggle.label}
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
        </FormSection>
      ) : null}

      {/* Accounts-payable ledger: balance, purchases, payments and reminders. Shown only when the
          route supplies session context (receiving locations) + a client (variant loading). */}
      {context ? (
        <SupplierLedger
          adapter={adapter}
          supplierId={supplier.id}
          canManage={canManage}
          locationOptions={ledgerLocationOptions}
          loadVariants={loadVariants}
          generateKey={generateKey}
        />
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
  const { t } = useI18n();
  return (
    <Notice
      testID="supplier-status-error"
      tone="danger"
      title={described.heading}
      message={described.message}
      action={
        described.recovery === "retry" ? (
          <PrimaryButton
            label={t("common.retry")}
            icon="refresh"
            testID="supplier-status-retry"
            onPress={onRetry}
          />
        ) : (
          <TextButton label={t("common.dismiss")} onPress={onDismiss} />
        )
      }
    />
  );
}

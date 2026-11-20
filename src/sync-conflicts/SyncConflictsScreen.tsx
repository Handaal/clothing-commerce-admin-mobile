import type {
  ListPosSyncConflictsResponse,
  MeContextResponse,
  PosSyncConflict,
  PosSyncConflictKind,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { useI18n, type MessageKey } from "../i18n";
import { formatMoneyMinor } from "../products/display";
import {
  Badge,
  EmptyState,
  ErrorNotice,
  FilterChips,
  InfoRow,
  Notice,
  PageHeader,
  ResponsiveList,
  ScrollScreen,
  SkeletonRows,
  SummaryStrip,
  Surface,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { formatDateTime } from "../i18n/format-date";

type KindFilter = PosSyncConflictKind | "all";
const KINDS: readonly KindFilter[] = [
  "all",
  "stock_shortfall",
  "voucher",
  "customer_duplicate",
  "customer_debt",
  "attendance",
  "dependency",
  "sync_integrity",
];

export interface SyncConflictsScreenProps {
  client: Pick<TenantCommerceClient, "listPosSyncConflicts">;
  context: MeContextResponse;
}

/**
 * ADR-042 §13.5 — tenant-wide report of the conflicts the server found when POS tills synced work done
 * during a temporary outage. Read-only: it never approves, reprices or edits a sale, payment, customer,
 * voucher or attendance record. Owners resolve stock, orders and customers in their normal screens.
 */
export function SyncConflictsScreen({ client, context }: SyncConflictsScreenProps) {
  const { t } = useI18n();
  const allowed = context.access.orders.canRead && context.access.orders.tenantWide;
  const [kind, setKind] = useState<KindFilter>("all");
  const load = useCallback(
    () =>
      allowed
        ? client.listPosSyncConflicts({ ...(kind === "all" ? {} : { kind }), limit: 200 })
        : Promise.resolve<ListPosSyncConflictsResponse | null>(null),
    [allowed, client, kind],
  );
  const { state, reload, refresh, refreshing } = useAsync(load);

  const report = state.status === "success" ? state.data : null;
  const options = useMemo(
    () =>
      KINDS.map((value) => ({
        value,
        label: t(`syncConflicts.kind.${value}` as MessageKey),
      })),
    [t],
  );

  if (!allowed) {
    return (
      <ScrollScreen wide>
        <PageHeader title={t("syncConflicts.title")} icon="sync-alert" />
        <Notice
          tone="warning"
          title={t("syncConflicts.accessTitle")}
          message={t("syncConflicts.accessBody")}
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen wide onRefresh={refresh} refreshing={refreshing}>
      <PageHeader
        title={t("syncConflicts.title")}
        description={t("syncConflicts.intro")}
        icon="sync-alert"
      />
      {report ? (
        <SummaryStrip
          testID="sync-conflicts-summary"
          items={[
            {
              label: t("syncConflicts.open"),
              value: String(report.summary.open),
              icon: "alert-circle-outline",
              tone: "accent",
            },
            {
              label: t("syncConflicts.informational"),
              value: String(report.summary.informational),
              icon: "information-outline",
              tone: "neutral",
            },
          ]}
        />
      ) : null}
      <FilterChips
        options={options}
        selected={kind}
        onSelect={setKind}
        testIDPrefix="sync-conflicts-kind"
      />
      {state.status === "loading" ? <SkeletonRows rows={4} /> : null}
      {state.status === "error" ? (
        <ErrorNotice
          heading={t("syncConflicts.loadFailed")}
          message={t("syncConflicts.loadFailedBody")}
          onRetry={reload}
          retryLabel={t("syncConflicts.retry")}
          testID="sync-conflicts-error"
        />
      ) : null}
      {report && report.items.length === 0 ? (
        <EmptyState
          icon="check-circle-outline"
          title={t("syncConflicts.noneTitle")}
          message={t("syncConflicts.noneBody")}
        />
      ) : null}
      <ResponsiveList>
        {(report?.items ?? []).map((item) => (
          <ConflictCard key={item.id} item={item} />
        ))}
      </ResponsiveList>
    </ScrollScreen>
  );
}

function ConflictCard({ item }: { item: PosSyncConflict }) {
  const { t } = useI18n();
  const reasonKey = `syncConflicts.reason.${item.reasonCode}` as MessageKey;
  const reason = t(reasonKey);
  return (
    <Surface testID="sync-conflict-card">
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text accessibilityRole="header" style={{ fontWeight: "600" }}>
            {t(`syncConflicts.kind.${item.kind}` as MessageKey)}
          </Text>
          <Badge
            label={t(`syncConflicts.status.${item.status}` as MessageKey)}
            tone={item.status === "open" ? "warning" : "neutral"}
          />
        </View>
        <Text>{reason === reasonKey ? item.reasonCode : reason}</Text>
        {item.kind === "stock_shortfall" ? (
          <InfoRow
            label={t("syncConflicts.stock")}
            value={t("syncConflicts.stockFacts", {
              sku: String(item.localEvidence.sku ?? "—"),
              requested: String(item.localEvidence.requestedQuantity ?? "—"),
              cached: String(item.localEvidence.cachedOnHand ?? "—"),
              server: String(item.serverEvidence.canonicalOnHandAtSync ?? "—"),
              short: String(item.quantity ?? "—"),
            })}
          />
        ) : null}
        {item.kind === "voucher" &&
        ("observedRemaining" in item.localEvidence || "serverRemaining" in item.serverEvidence) ? (
          <InfoRow
            label={t("syncConflicts.voucherUsage")}
            value={t("syncConflicts.voucherFacts", {
              observed: remainingLabel(item.localEvidence.observedRemaining, t),
              server: remainingLabel(item.serverEvidence.serverRemaining, t),
            })}
          />
        ) : null}
        {item.amountMinor !== null && item.currency ? (
          <InfoRow
            label={t("syncConflicts.amount")}
            value={formatMoneyMinor(item.amountMinor, item.currency)}
          />
        ) : null}
        <InfoRow
          label={t("syncConflicts.reference")}
          value={item.localReference ?? item.syncCommandId ?? "—"}
        />
        {item.references.orderId ? (
          <InfoRow label={t("syncConflicts.order")} value={item.references.orderId} />
        ) : null}
        <InfoRow label={t("syncConflicts.detected")} value={formatDateTime(item.detectedAt)} />
        <Text>{t(`syncConflicts.next.${item.kind}` as MessageKey)}</Text>
      </View>
    </Surface>
  );
}

/** Remaining-usage evidence: absent ⇒ "—", JSON null ⇒ no finite limit. */
function remainingLabel(value: unknown, t: (key: MessageKey) => string): string {
  if (value === undefined) return "—";
  if (value === null) return t("syncConflicts.unlimited");
  return String(value);
}

import type { OrderDetailResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { classifyCommerceError } from "../commerce/errors";
import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  ConfirmDialog,
  Notice,
  PrimaryButton,
  SectionHeading,
  Surface,
  TextField,
} from "../ui/components";
import { spacing } from "../ui/theme";
import { useToast } from "../ui/Toast";
import { describeOrderWriteError, type DescribedOrderWriteError } from "./write-errors";

export type OrderOperationsClient = Pick<TenantCommerceClient, "fulfillOrder" | "cancelOrder">;

/** Units still to ship per line number (only lines with a remainder). Display/input helper only. */
export function remainingByLine(detail: OrderDetailResponse): Map<number, number> {
  const fulfilled = new Map(
    detail.fulfillmentProgress.lines.map((line) => [line.lineNumber, line.fulfilledQuantity]),
  );
  const remaining = new Map<number, number>();
  for (const line of detail.lines) {
    const left = line.quantity - (fulfilled.get(line.lineNumber) ?? 0);
    if (left > 0) remaining.set(line.lineNumber, left);
  }
  return remaining;
}

function defaults(detail: OrderDetailResponse): Record<number, string> {
  return Object.fromEntries(
    [...remainingByLine(detail)].map(([lineNumber, left]) => [lineNumber, String(left)]),
  );
}

type Operation = "fulfil" | "cancel";

/**
 * Staff actions on an ONLINE order: ship items (orders.fulfill + inventory.issue — the API takes the stock
 * from the location holding it for the order) and cancel an order nothing has shipped from (orders.cancel —
 * releases the held stock). Shown only when `/me/context` advertises the grant; the API still authorizes
 * every request. One idempotency key per confirmed intent: an ambiguous network failure retries with the
 * same key so the order is shipped or cancelled at most once.
 */
export function OrderOperations({
  data,
  client,
  canFulfill,
  canCancel,
  onUpdated,
  onReload,
  newKey = secureIdempotencyKey,
}: {
  data: OrderDetailResponse;
  client: OrderOperationsClient;
  canFulfill: boolean;
  canCancel: boolean;
  onUpdated: (detail: OrderDetailResponse) => void;
  onReload: () => void;
  newKey?: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [ship, setShip] = useState<Record<number, string>>(() => defaults(data));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<Operation | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<
    (DescribedOrderWriteError & { operation: Operation }) | null
  >(null);
  const pendingKey = useRef<{ operation: Operation; key: string } | null>(null);

  const remaining = useMemo(() => remainingByLine(data), [data]);
  const placed = data.header.status === "placed" && data.header.channel === "online";
  const showFulfil = placed && canFulfill && remaining.size > 0;
  const showCancel = placed && canCancel && data.fulfillmentProgress.status === "unfulfilled";

  const plan = useMemo(() => {
    const lines: { lineNumber: number; quantity: number }[] = [];
    const invalid = new Set<number>();
    for (const [lineNumber, left] of remaining) {
      const raw = (ship[lineNumber] ?? "").trim();
      if (raw === "" || raw === "0") continue;
      const quantity = Number(raw);
      if (!/^\d+$/.test(raw) || quantity > left) {
        invalid.add(lineNumber);
        continue;
      }
      lines.push({ lineNumber, quantity });
    }
    const units = lines.reduce((sum, line) => sum + line.quantity, 0);
    const all = [...remaining.values()].reduce((sum, left) => sum + left, 0);
    return { lines, invalid, units, all };
  }, [remaining, ship]);

  if (!showFulfil && !showCancel) return null;

  const run = async (operation: Operation) => {
    setConfirm(null);
    setBusy(true);
    setFailure(null);
    // Reuse the key only when retrying the SAME operation after an ambiguous failure.
    if (pendingKey.current?.operation !== operation) {
      pendingKey.current = { operation, key: newKey() };
    }
    const idempotencyKey = pendingKey.current.key;
    try {
      const next =
        operation === "fulfil"
          ? await client.fulfillOrder({
              orderId: data.header.id,
              idempotencyKey,
              lines: plan.lines,
            })
          : await client.cancelOrder({
              orderId: data.header.id,
              idempotencyKey,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            });
      pendingKey.current = null;
      setShip(defaults(next));
      setReason("");
      onUpdated(next);
      toast.success(
        operation === "cancel"
          ? t("orderOps.cancelledToast", { number: next.header.orderNumber })
          : next.fulfillmentProgress.status === "fulfilled"
            ? t("orderOps.fulfilledToast", { number: next.header.orderNumber })
            : t("orderOps.partialToast", { number: next.header.orderNumber }),
      );
    } catch (error) {
      const described = describeOrderWriteError(classifyCommerceError(error));
      if (described.recovery !== "retry") pendingKey.current = null;
      setFailure({ ...described, operation });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface tone="accent" testID="order-operations">
      <SectionHeading title={t("orderOps.title")} detail={t("orderOps.detail")} />

      {failure ? (
        <Notice
          tone="danger"
          title={failure.heading}
          message={failure.message}
          testID="order-ops-error"
          action={
            failure.recovery === "retry" ? (
              <PrimaryButton
                label={t("common.retrySafely")}
                icon="refresh"
                testID="order-ops-retry"
                disabled={busy}
                onPress={() => void run(failure.operation)}
              />
            ) : failure.recovery === "reload" ? (
              <PrimaryButton
                label={t("orderDetail.refresh")}
                icon="refresh"
                testID="order-ops-reload"
                onPress={onReload}
              />
            ) : undefined
          }
        />
      ) : null}

      {showFulfil ? (
        <View style={styles.block}>
          {data.lines
            .filter((line) => remaining.has(line.lineNumber))
            .map((line) => (
              <TextField
                key={line.lineNumber}
                label={t("orderOps.shipNow", {
                  item: `${line.productName} · ${line.sku}`,
                  left: remaining.get(line.lineNumber) ?? 0,
                })}
                value={ship[line.lineNumber] ?? ""}
                numeric
                testID={`order-ship-${line.lineNumber}`}
                error={plan.invalid.has(line.lineNumber) ? t("orderOps.qtyInvalid") : null}
                onChangeText={(value) =>
                  setShip((current) => ({ ...current, [line.lineNumber]: value }))
                }
              />
            ))}
          <PrimaryButton
            label={
              plan.units > 0 && plan.units === plan.all
                ? t("orderOps.fulfilAll")
                : t("orderOps.fulfilSome", { count: plan.units })
            }
            icon="truck-check-outline"
            testID="order-fulfil"
            disabled={busy || plan.invalid.size > 0 || plan.units === 0}
            onPress={() => setConfirm("fulfil")}
          />
        </View>
      ) : null}

      {showCancel ? (
        <View style={styles.block}>
          <TextField
            label={t("orderOps.cancelReason")}
            value={reason}
            multiline
            testID="order-cancel-reason"
            onChangeText={setReason}
          />
          <PrimaryButton
            label={t("orderOps.cancelOrder")}
            icon="close-circle-outline"
            variant="secondary"
            testID="order-cancel"
            disabled={busy}
            onPress={() => setConfirm("cancel")}
          />
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirm === "fulfil"}
        tone="brand"
        icon="truck-check-outline"
        title={t("orderOps.fulfilTitle", { number: data.header.orderNumber })}
        message={t("orderOps.fulfilMessage", { count: plan.units })}
        confirmLabel={t("orderOps.fulfilConfirm")}
        testID="order-fulfil-dialog"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run("fulfil")}
      />
      <ConfirmDialog
        visible={confirm === "cancel"}
        title={t("orderOps.cancelTitle", { number: data.header.orderNumber })}
        message={t("orderOps.cancelMessage")}
        confirmLabel={t("orderOps.cancelOrder")}
        testID="order-cancel-dialog"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run("cancel")}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
});

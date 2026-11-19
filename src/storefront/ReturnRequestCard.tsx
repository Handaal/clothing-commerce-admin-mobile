import {
  whatsAppLink,
  type ReturnRequest,
  type ReturnRequestReason,
  type ReturnRequestStatus,
  type TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { classifyCommerceError } from "../commerce/errors";
import { useI18n, type MessageKey } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  Badge,
  InfoRow,
  Notice,
  PrimaryButton,
  Surface,
  TextButton,
  TextField,
} from "../ui/components";
import { spacing, typography } from "../ui/theme";
import { useToast } from "../ui/Toast";
import { createThemedStyles } from "../ui/useTheme";

export type ReturnRequestClient = Pick<TenantCommerceClient, "updateReturnRequestStatus">;

export const REASON_KEYS: Record<ReturnRequestReason, MessageKey> = {
  too_small: "returnReq.reason.too_small",
  too_big: "returnReq.reason.too_big",
  not_as_pictured: "returnReq.reason.not_as_pictured",
  damaged: "returnReq.reason.damaged",
  wrong_item: "returnReq.reason.wrong_item",
  changed_mind: "returnReq.reason.changed_mind",
  other: "returnReq.reason.other",
};

export const STATUS_KEYS: Record<ReturnRequestStatus, MessageKey> = {
  requested: "returnReq.status.requested",
  approved: "returnReq.status.approved",
  declined: "returnReq.status.declined",
  completed: "returnReq.status.completed",
};

const STATUS_TONE: Record<ReturnRequestStatus, "warning" | "brand" | "danger" | "success"> = {
  requested: "warning",
  approved: "brand",
  declined: "danger",
  completed: "success",
};

/** The decisions staff can make from each status (mirrors the API's allowed moves). */
export function nextStatuses(
  status: ReturnRequestStatus,
): ("approved" | "declined" | "completed")[] {
  if (status === "requested") return ["approved", "declined"];
  if (status === "approved") return ["completed", "declined"];
  return [];
}

/**
 * One customer return request (SDK 0.48): what they want back and why, their note, and the staff
 * decision. A request moves no stock or money — staff arrange the pickup/exchange, then mark it
 * completed. Decisions are offered only when `canDecide`; the API still authorizes each one.
 */
export function ReturnRequestCard({
  request,
  client,
  canDecide,
  onChanged,
  onOpenOrder,
  newKey = secureIdempotencyKey,
  openUrl = (url: string) => Linking.openURL(url),
}: {
  request: ReturnRequest;
  client: ReturnRequestClient;
  canDecide: boolean;
  onChanged: (updated: ReturnRequest) => void;
  onOpenOrder?: (orderId: string) => void;
  newKey?: IdempotencyKeyFactory;
  openUrl?: (url: string) => Promise<unknown>;
}) {
  const { t, locale } = useI18n();
  const { styles } = useStyles();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same key while retrying the same decision after an unclear failure.
  const pending = useRef<{ status: string; key: string } | null>(null);
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
  });

  async function decide(status: "approved" | "declined" | "completed") {
    if (pending.current?.status !== status) pending.current = { status, key: newKey() };
    setBusy(true);
    setError(null);
    try {
      const updated = await client.updateReturnRequestStatus({
        requestId: request.id,
        status,
        idempotencyKey: pending.current.key,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      pending.current = null;
      setNote("");
      toast.success(t("returnReq.saved", { status: t(STATUS_KEYS[updated.status]) }));
      onChanged(updated);
    } catch (caught) {
      const classified = classifyCommerceError(caught);
      if (classified.kind !== "network") pending.current = null;
      setError(
        classified.code === "RETURN_REQUEST_STATUS_CONFLICT"
          ? t("returnReq.conflict")
          : classified.kind === "forbidden"
            ? t("returnReq.forbidden")
            : classified.message,
      );
    } finally {
      setBusy(false);
    }
  }

  const firstName = (request.customerName ?? "").trim().split(/\s+/u)[0] ?? "";
  const chat = request.customerPhone
    ? whatsAppLink(
        request.customerPhone,
        t("returnReq.chatText", {
          name: firstName,
          reference: request.reference,
          order: request.orderNumber,
        }),
      )
    : null;
  const actions = canDecide ? nextStatuses(request.status) : [];

  return (
    <Surface testID={`return-request-${request.reference}`}>
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text style={styles.reference}>{request.reference}</Text>
          <Text style={styles.meta}>
            {[request.customerName, dateFormat.format(new Date(request.createdAt))]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <Badge
          label={t(STATUS_KEYS[request.status])}
          tone={STATUS_TONE[request.status]}
          testID={`return-request-status-${request.reference}`}
        />
      </View>

      {request.lines.map((line) => (
        <View key={line.lineNumber} style={styles.line}>
          <Text style={styles.lineName}>
            {line.quantity} × {line.productName}
          </Text>
          <Text style={styles.meta}>
            {[line.optionSummary ?? line.variantName, t(REASON_KEYS[line.reason])]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      ))}

      <InfoRow
        label={t("returnReq.wants")}
        value={t(request.preference === "exchange" ? "returnReq.exchange" : "returnReq.refund")}
      />
      {request.customerNote ? (
        <Text style={styles.note} selectable>
          “{request.customerNote}”
        </Text>
      ) : null}
      {request.staffNote ? (
        <InfoRow label={t("returnReq.staffNote")} value={request.staffNote} />
      ) : null}

      {actions.length > 0 ? (
        <>
          <TextField
            label={t("returnReq.noteLabel")}
            value={note}
            onChangeText={setNote}
            placeholder={t("returnReq.notePlaceholder")}
            testID={`return-request-note-${request.reference}`}
          />
          <View style={styles.actions}>
            {actions.map((status) => (
              <PrimaryButton
                key={status}
                label={t(`returnReq.action.${status}`)}
                variant={status === "declined" ? "secondary" : "primary"}
                disabled={busy}
                testID={`return-request-${status}-${request.reference}`}
                onPress={() => void decide(status)}
              />
            ))}
          </View>
        </>
      ) : null}
      {error ? <Notice tone="danger" message={error} /> : null}

      <View style={styles.links}>
        {chat ? (
          <TextButton
            label={t("returnReq.chat")}
            icon="whatsapp"
            testID={`return-request-chat-${request.reference}`}
            onPress={() => void openUrl(chat).catch(() => undefined)}
          />
        ) : null}
        {onOpenOrder ? (
          <TextButton
            label={t("returnReq.openOrder", { order: request.orderNumber })}
            icon="receipt-text-outline"
            onPress={() => onOpenOrder(request.orderId)}
          />
        ) : null}
      </View>
    </Surface>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    headCopy: { flex: 1, gap: 2 },
    reference: { color: colors.ink, ...typography.cardTitle, fontWeight: "800" },
    meta: { color: colors.inkMuted, ...typography.caption },
    line: {
      gap: 2,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    lineName: { color: colors.ink, ...typography.body, fontWeight: "700" },
    note: { color: colors.inkMuted, ...typography.body, fontStyle: "italic" },
    actions: { gap: spacing.sm },
    links: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  });
  return { styles };
});

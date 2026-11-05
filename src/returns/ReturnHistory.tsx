import type { ReturnDetailResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  PressableRow,
  SurfaceRow,
  TextButton,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { loadAllReturns } from "./load";
import { dispositionSummary, refundStatusLabel, returnChannelLabel } from "./refund";

export interface ReturnHistoryProps {
  client: Pick<TenantCommerceClient, "listReturns">;
  orderId: string;
  /** When provided, each return row becomes navigable to the full return detail. */
  onOpenReturn?: (returnId: string) => void;
}

/**
 * Per-order return history. The SDK exposes returns only through their original order (there is no
 * global list endpoint), so this section IS the returns list for that order — it never invents a
 * client-side database. It loads independently of the order body: a return-scope denial or transient
 * failure here is surfaced distinctly and does not break the rest of the order detail.
 */
export function ReturnHistory({ client, orderId, onOpenReturn }: ReturnHistoryProps) {
  const { t } = useI18n();
  const load = useCallback(() => loadAllReturns(client, orderId), [client, orderId]);
  const { state, reload } = useAsync<ReturnDetailResponse[]>(load);

  return (
    <>
      <Divider />
      <Eyebrow>{t("returnHistory.title")}</Eyebrow>
      {renderBody()}
    </>
  );

  function renderBody() {
    if (state.status === "loading") {
      return <LoadingBlock label={t("returnHistory.loading")} />;
    }

    if (state.status === "error") {
      if (state.error.kind === "forbidden") {
        return <Body>{t("returnHistory.forbidden")}</Body>;
      }
      return (
        <View style={{ gap: 8 }}>
          <Body>
            {t("returnHistory.errorLine", {
              heading: errorHeading(state.error.kind),
              message: state.error.message,
            })}
          </Body>
          {isRetryable(state.error.kind) ? (
            <TextButton label={t("common.tryAgain")} onPress={reload} />
          ) : null}
        </View>
      );
    }

    const returns = state.data;
    if (returns.length === 0) {
      return <Body>{t("returnHistory.empty")}</Body>;
    }

    return (
      <View style={{ gap: 12 }}>
        {returns.map((entry, index) => {
          const content = (
            <>
              <Title>{formatMoneyMinor(entry.amountMinor, entry.currency)}</Title>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Badge label={returnChannelLabel(entry.channel)} />
                <Badge
                  label={refundStatusLabel(entry.refund.status)}
                  testID={`return-refund-status-${index}`}
                />
              </View>
              <InfoRow label={t("returnHistory.return")} value={entry.id} />
              <InfoRow label={t("returnHistory.date")} value={entry.createdAt} />
              <InfoRow label={t("returnHistory.disposition")} value={dispositionSummary(entry.lines)} />
            </>
          );
          return onOpenReturn ? (
            <PressableRow
              key={entry.id}
              testID={`return-row-${index}`}
              onPress={() => onOpenReturn(entry.id)}
            >
              {content}
            </PressableRow>
          ) : (
            <SurfaceRow key={entry.id} testID={`return-row-${index}`}>
              {content}
            </SurfaceRow>
          );
        })}
      </View>
    );
  }
}

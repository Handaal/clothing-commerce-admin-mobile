import type {
  MeContextResponse,
  ReturnRequest,
  ReturnRequestListResponse,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  FilterChips,
  LoadingBlock,
  Notice,
  PageHeader,
  ScrollScreen,
  TextButton,
} from "../ui/components";
import { spacing } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { ReturnRequestCard } from "./ReturnRequestCard";

type Filter = "open" | "all";

export interface ReturnRequestsScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onBack: () => void;
  onOpenOrder?: (orderId: string) => void;
}

/** Replace one request in the list after a decision. */
export function replaceRequest(
  list: ReturnRequestListResponse,
  updated: ReturnRequest,
): ReturnRequestListResponse {
  const before = list.requests.find((request) => request.id === updated.id);
  return {
    requests: list.requests.map((request) => (request.id === updated.id ? updated : request)),
    awaitingDecision: Math.max(
      0,
      list.awaitingDecision -
        (before?.status === "requested" && updated.status !== "requested" ? 1 : 0),
    ),
  };
}

/**
 * Website → Returns (SDK 0.48): return requests customers sent from the website's order tracking page.
 * Open requests first; staff approve or decline, arrange the pickup or exchange themselves, then mark
 * the request completed. Listing needs returns.read; deciding needs returns.create (the API decides —
 * a 403 here shows a notice).
 */
export function ReturnRequestsScreen({
  tenantId,
  context,
  onBack,
  onOpenOrder,
}: ReturnRequestsScreenProps) {
  const { t } = useI18n();
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const [filter, setFilter] = useState<Filter>("open");
  const load = useCallback(
    () => client.listReturnRequests({ status: filter, limit: 100 }),
    [client, filter],
  );
  const { state, reload, refresh, refreshing } = useAsync<ReturnRequestListResponse>(load);
  const [local, setLocal] = useState<ReturnRequestListResponse | null>(null);
  const data = local ?? (state.status === "success" ? state.data : null);
  // Owners/managers who can read orders usually hold the returns grants too; the API is the judge.
  const canDecide = context.access.orders.canRead;

  const forbidden = state.status === "error" && state.error.kind === "forbidden";

  return (
    <ScrollScreen
      onRefresh={() => {
        setLocal(null);
        refresh();
      }}
      refreshing={refreshing}
    >
      <PageHeader
        eyebrow={t("returnReq.eyebrow")}
        title={t("returnReq.title")}
        description={t("returnReq.desc")}
        icon="keyboard-return"
        onBack={onBack}
      />
      <FilterChips<Filter>
        options={[
          {
            value: "open",
            label: t("returnReq.filterOpen"),
            ...(data ? { count: data.awaitingDecision } : {}),
          },
          { value: "all", label: t("returnReq.filterAll") },
        ]}
        selected={filter}
        onSelect={(value) => {
          setLocal(null);
          setFilter(value);
        }}
        testIDPrefix="return-requests-filter"
      />
      {state.status === "loading" && !local ? (
        <LoadingBlock label={t("returnReq.loading")} />
      ) : null}
      {forbidden ? (
        <Notice
          tone="warning"
          title={t("returnReq.accessTitle")}
          message={t("returnReq.accessBody")}
        />
      ) : state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <TextButton label={t("common.retry")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {data ? (
        data.requests.length === 0 ? (
          <Notice
            message={filter === "open" ? t("returnReq.emptyOpen") : t("returnReq.emptyAll")}
            testID="return-requests-empty"
          />
        ) : (
          <View style={styles.list}>
            {data.requests.map((request) => (
              <ReturnRequestCard
                key={request.id}
                request={request}
                client={client}
                canDecide={canDecide}
                onChanged={(updated) => setLocal(replaceRequest(data, updated))}
                {...(onOpenOrder ? { onOpenOrder } : {})}
              />
            ))}
          </View>
        )
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.md } });

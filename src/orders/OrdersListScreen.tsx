import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback } from "react";
import { View } from "react-native";

// Feature-agnostic Commerce display helpers, shared with the Products/Inventory read surfaces.
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  Divider,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { loadAllOrders, type OrderListItem } from "./load";

export interface OrdersListScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onOpenOrder: (orderId: string) => void;
  onBack: () => void;
}

/**
 * Read-only Orders list for the active tenant. Reads `access.orders.canRead` from `/me/context` for
 * UX only; the server stays authoritative (already applying ONLINE brand / POS branch scope), and a
 * denied `GET /orders` surfaces as a classified error, never a silent empty list. The client never
 * reconstructs scope rules — it renders exactly the already-authorized rows the API returns.
 */
export function OrdersListScreen({
  tenantId,
  context,
  onOpenOrder,
  onBack,
}: OrdersListScreenProps) {
  // Context-driven UX gate, checked before any fetch is issued. Not authorization — the API enforces
  // that — but there is no point calling `/orders` for a caller known to lack read access.
  if (!context.access.orders.canRead) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Orders" title="Orders" onBack={onBack} />
        <Divider />
        <Body>You do not have read access to orders. Ask an owner or administrator.</Body>
      </ScrollScreen>
    );
  }

  return (
    <OrdersListContent
      tenantId={tenantId}
      context={context}
      onOpenOrder={onOpenOrder}
      onBack={onBack}
    />
  );
}

function OrdersListContent({ tenantId, onOpenOrder, onBack }: OrdersListScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  // One bounded producer that follows the server cursor across all pages (see loadAllOrders).
  const load = useCallback(() => loadAllOrders(client), [client]);
  const { state, reload } = useAsync<OrderListItem[]>(load);

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Orders" title="Orders" onBack={onBack} />
      <Divider />
      {state.status === "loading" ? <LoadingBlock label="Loading orders…" /> : null}
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
        <Body>No orders yet. Orders placed in this business will appear here.</Body>
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <View style={{ gap: 12 }}>
          {state.data.map((order) => (
            <PressableRow
              key={order.id}
              testID={`order-row-${order.id}`}
              onPress={() => onOpenOrder(order.id)}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Title>{order.orderNumber}</Title>
                <Badge label={order.status} testID={`order-status-${order.id}`} />
              </View>
              <InfoRow label="Channel" value={order.channel} />
              <InfoRow label="Total" value={formatMoneyMinor(order.totalMinor, order.currency)} />
              <InfoRow label="Placed" value={order.placedAt} />
            </PressableRow>
          ))}
        </View>
      ) : null}
    </ScrollScreen>
  );
}

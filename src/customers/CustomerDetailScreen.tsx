import type { CustomerDetailResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
import { formatOrderDate } from "../orders/display";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  Divider,
  EmptyState,
  FormSection,
  InfoRow,
  LoadingBlock,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  Surface,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { loadAllCustomerOrders, type CustomerOrderItem } from "./load";

export interface CustomerDetailScreenProps {
  tenantId: string;
  customerId: string;
  onBack: () => void;
  /** When provided, each order row becomes navigable to the full order detail. */
  onOpenOrder?: (orderId: string) => void;
}

/** Read-only customer profile with lifetime totals and full order history. */
export function CustomerDetailScreen({
  tenantId,
  customerId,
  onBack,
  onOpenOrder,
}: CustomerDetailScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const load = useCallback(() => client.getCustomer(customerId), [client, customerId]);
  const { state, reload } = useAsync<CustomerDetailResponse>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("customers.eyebrow")}
          title={t("customerDetail.title")}
          icon="account-outline"
          onBack={onBack}
        />
        <LoadingBlock label={t("customerDetail.loading")} />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("customers.eyebrow")}
          title={errorHeading(state.error.kind)}
          icon="account-outline"
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

  const customer = state.data;
  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("customers.eyebrow")}
        title={customer.name}
        description={t("customerDetail.recordDesc")}
        icon="account-outline"
        onBack={onBack}
      />

      <Surface tone="brand">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Badge label={t("customers.orderCount", { count: customer.orderCount })} tone="brand" />
          {customer.currency ? (
            <Badge
              label={formatMoneyMinor(customer.totalSpentMinor, customer.currency)}
              tone="success"
              testID="customer-total-spent"
            />
          ) : null}
        </View>
      </Surface>

      <FormSection title={t("customerDetail.profileSection")} icon="card-account-details-outline">
        <InfoRow label={t("customers.phone")} value={customer.phone} />
        {customer.email ? <InfoRow label={t("customers.email")} value={customer.email} /> : null}
        <InfoRow label={t("customerDetail.since")} value={formatOrderDate(customer.createdAt)} />
        {customer.lastOrderAt ? (
          <InfoRow
            label={t("customerDetail.lastOrder")}
            value={formatOrderDate(customer.lastOrderAt)}
          />
        ) : null}
      </FormSection>

      <Divider />
      <CustomerOrders tenantId={tenantId} customerId={customerId} onOpenOrder={onOpenOrder} />
    </ScrollScreen>
  );
}

function CustomerOrders({
  tenantId,
  customerId,
  onOpenOrder,
}: {
  tenantId: string;
  customerId: string;
  onOpenOrder?: (orderId: string) => void;
}) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const load = useCallback(() => loadAllCustomerOrders(client, customerId), [client, customerId]);
  const { state, reload } = useAsync<CustomerOrderItem[]>(load);

  return (
    <>
      <SectionHeading
        title={t("customerDetail.ordersSection")}
        detail={t("customerDetail.ordersDetail")}
      />
      {state.status === "loading" ? (
        <LoadingBlock label={t("customerDetail.ordersLoading")} />
      ) : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <EmptyState
          icon="receipt-text-outline"
          title={t("customerDetail.noOrdersTitle")}
          message={t("customerDetail.noOrdersBody")}
        />
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <View style={{ gap: 12 }}>
          {state.data.map((order) => {
            const content = (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Title>{order.orderNumber}</Title>
                  <Badge label={order.channel.toUpperCase()} tone="brand" />
                </View>
                <InfoRow
                  label={t("customerDetail.orderTotal")}
                  value={formatMoneyMinor(order.totalMinor, order.currency)}
                />
                <InfoRow label={t("customerDetail.orderStatus")} value={order.status} />
                <Body>{formatOrderDate(order.placedAt)}</Body>
              </>
            );
            return onOpenOrder ? (
              <PressableRow
                key={order.id}
                testID={`customer-order-${order.id}`}
                onPress={() => onOpenOrder(order.id)}
              >
                {content}
              </PressableRow>
            ) : (
              <Surface key={order.id} testID={`customer-order-${order.id}`}>
                {content}
              </Surface>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

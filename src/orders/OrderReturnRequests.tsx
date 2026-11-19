import type { ReturnRequest, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
import { ReturnRequestCard } from "../storefront/ReturnRequestCard";
import { SectionHeading } from "../ui/components";
import { spacing } from "../ui/theme";
import { useAsync } from "../ui/useAsync";

/**
 * Online order → the customer's return requests for it (SDK 0.48), with the same decisions as
 * Website → Returns. Renders nothing while loading, when there are none, or when the role can't read
 * returns (the order detail stays usable).
 */
export function OrderReturnRequests({
  orderId,
  client,
  canDecide,
}: {
  orderId: string;
  client: Pick<TenantCommerceClient, "listReturnRequests" | "updateReturnRequestStatus">;
  canDecide: boolean;
}) {
  const { t } = useI18n();
  const load = useCallback(
    () => client.listReturnRequests({ orderId, status: "all", limit: 50 }),
    [client, orderId],
  );
  const { state } = useAsync(load);
  const [changed, setChanged] = useState<Record<string, ReturnRequest>>({});
  if (state.status !== "success" || state.data.requests.length === 0) return null;
  return (
    <View style={{ gap: spacing.md }} testID="order-return-requests">
      <SectionHeading title={t("returnReq.orderTitle")} detail={t("returnReq.orderDetail")} />
      {state.data.requests.map((request) => (
        <ReturnRequestCard
          key={request.id}
          request={changed[request.id] ?? request}
          client={client}
          canDecide={canDecide}
          onChanged={(updated) => setChanged((current) => ({ ...current, [updated.id]: updated }))}
        />
      ))}
    </View>
  );
}

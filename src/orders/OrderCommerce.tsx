import type { OrderCommerceDetails, OrderDetailResponse } from "@shifted/clothing-commerce-sdk";
import { StyleSheet, Text, View } from "react-native";

import { useI18n, type MessageKey } from "../i18n";
import { formatMoneyMinor } from "../products/display";
import { formatOrderDate } from "./display";
import { Badge, Body, DetailCard, InfoRow, Notice } from "../ui/components";
import { spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";

const paymentMethodKey: Record<NonNullable<OrderCommerceDetails["payment"]>["method"], MessageKey> =
  {
    cash: "payMethod.cash",
    cash_on_delivery: "payMethod.cod",
    electronic: "payMethod.electronic",
  };

const paymentStatusKey: Record<NonNullable<OrderCommerceDetails["payment"]>["status"], MessageKey> =
  {
    pending: "orderCommerce.paymentStatus.pending",
    authorized: "orderCommerce.paymentStatus.authorized",
    captured: "orderCommerce.paymentStatus.captured",
    failed: "orderCommerce.paymentStatus.failed",
    cancelled: "orderCommerce.paymentStatus.cancelled",
    refunded: "orderCommerce.paymentStatus.refunded",
  };

const reservationKey: Record<OrderCommerceDetails["reservations"][number]["status"], MessageKey> = {
  active: "reservation.active",
  consumed: "reservation.consumed",
  released: "reservation.released",
  expired: "reservation.expired",
};

/** Customer + delivery snapshot captured at checkout, in one calm card. */
export function OrderCustomerCard({ data }: { data: OrderDetailResponse }) {
  const { t } = useI18n();
  const customer = data.commerce?.customer;
  const delivery = data.commerce?.delivery;

  return (
    <>
      <DetailCard title={t("orderCommerce.customerSection")} testID="order-customer">
        {customer ? (
          <View>
            <InfoRow label={t("orderCommerce.name")} value={customer.name} />
            <InfoRow label={t("orderCommerce.phone")} value={customer.phone} />
            {customer.email ? (
              <InfoRow label={t("orderCommerce.email")} value={customer.email} />
            ) : null}
          </View>
        ) : (
          <Body>{t("orderCommerce.customerUnavailable")}</Body>
        )}
      </DetailCard>

      <DetailCard title={t("orderCommerce.deliverySection")} testID="order-delivery">
        {delivery ? (
          <View>
            <InfoRow label={t("orderCommerce.recipient")} value={delivery.recipientName} />
            <InfoRow label={t("orderCommerce.deliveryPhone")} value={delivery.phone} />
            <InfoRow label={t("orderCommerce.address")} value={delivery.line1} />
            {delivery.line2 ? (
              <InfoRow label={t("orderCommerce.addressContinued")} value={delivery.line2} />
            ) : null}
            <InfoRow label={t("orderCommerce.city")} value={delivery.city} />
            {delivery.region ? (
              <InfoRow label={t("orderCommerce.region")} value={delivery.region} />
            ) : null}
            {delivery.postalCode ? (
              <InfoRow label={t("orderCommerce.postalCode")} value={delivery.postalCode} />
            ) : null}
            <InfoRow label={t("orderCommerce.country")} value={delivery.countryCode} />
            {delivery.notes ? (
              <InfoRow label={t("orderCommerce.deliveryNotes")} value={delivery.notes} />
            ) : null}
          </View>
        ) : (
          <Body>{t("orderCommerce.deliveryUnavailable")}</Body>
        )}
      </DetailCard>
    </>
  );
}

/** The recorded payment state. Status sits beside the title instead of on its own line. */
export function OrderPaymentCard({ data }: { data: OrderDetailResponse }) {
  const { t } = useI18n();
  const payment = data.commerce?.payment;
  return (
    <DetailCard
      title={t("orderCommerce.paymentSection")}
      action={
        payment ? (
          <Badge label={t(paymentStatusKey[payment.status])} testID="order-payment-status" />
        ) : undefined
      }
      testID="order-payment"
    >
      {payment ? (
        <View>
          <InfoRow label={t("orderCommerce.method")} value={t(paymentMethodKey[payment.method])} />
          <InfoRow
            label={t("orderCommerce.paymentAmount")}
            value={formatMoneyMinor(payment.amountMinor, payment.currency)}
          />
          {payment.provider ? (
            <InfoRow label={t("orderCommerce.provider")} value={payment.provider} />
          ) : null}
          {payment.status === "captured" && payment.capturedAt ? (
            <InfoRow
              label={t("orderCommerce.collectedOn")}
              value={formatOrderDate(payment.capturedAt)}
            />
          ) : null}
        </View>
      ) : (
        <Body>{t("orderCommerce.paymentUnavailable")}</Body>
      )}
      {payment?.method === "cash_on_delivery" && payment.status === "pending" ? (
        <Notice tone="warning" message={t("orderCommerce.codPending")} />
      ) : null}
    </DetailCard>
  );
}

/** Stock reservations — operational detail, shown inside "More details". */
export function OrderReservations({ data }: { data: OrderDetailResponse }) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const { commerce, lines } = data;
  return (
    <DetailCard title={t("orderCommerce.stockCommitment")} testID="order-reservations">
      {commerce && commerce.reservations.length > 0 ? (
        <View style={styles.list}>
          {commerce.reservations.map((reservation, index) => {
            const line = lines.find((item) => item.variantId === reservation.variantId);
            return (
              <View
                key={`${reservation.variantId}-${reservation.inventoryLocationId}-${index}`}
                style={[styles.item, index > 0 && styles.itemDivided]}
              >
                <View style={styles.itemHeader}>
                  <Text numberOfLines={1} style={styles.itemTitle}>
                    {line ? `${line.productName} · ${line.sku}` : t("orderCommerce.orderItem")}
                  </Text>
                  <Badge
                    label={t(reservationKey[reservation.status])}
                    testID={`order-reservation-${index}`}
                  />
                </View>
                <InfoRow
                  label={t("orderCommerce.committedQty")}
                  value={String(reservation.quantity)}
                />
                <InfoRow
                  label={t("orderCommerce.consumedQty")}
                  value={String(reservation.consumedQuantity)}
                />
                {reservation.expiresAt ? (
                  <InfoRow label={t("orderCommerce.expires")} value={reservation.expiresAt} />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Body>{t("orderCommerce.noStockCommitment")}</Body>
      )}
    </DetailCard>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    list: { gap: spacing.md },
    item: { gap: 0 },
    itemDivided: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    itemHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    itemTitle: { flex: 1, color: colors.ink, ...typography.bodySmall, fontWeight: "700" },
  });
  return { colors, styles };
});

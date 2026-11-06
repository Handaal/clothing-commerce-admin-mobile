import type { OrderCommerceDetails, OrderDetailResponse } from "@shifted/clothing-commerce-sdk";
import { StyleSheet, Text, View } from "react-native";

import { useI18n, type MessageKey } from "../i18n";
import { formatMoneyMinor } from "../products/display";
import {
  Badge,
  Body,
  FormSection,
  InfoRow,
  Notice,
  SectionHeading,
  Surface,
  SurfaceRow,
} from "../ui/components";
import { AppIcon } from "../ui/Icon";
import { colors, radius, spacing } from "../ui/theme";

const paymentMethodKey: Record<NonNullable<OrderCommerceDetails["payment"]>["method"], MessageKey> =
  {
    cash: "payMethod.cash",
    cash_on_delivery: "payMethod.cod",
    electronic: "payMethod.electronic",
  };

const reservationKey: Record<OrderCommerceDetails["reservations"][number]["status"], MessageKey> = {
  active: "reservation.active",
  consumed: "reservation.consumed",
  released: "reservation.released",
  expired: "reservation.expired",
};

/** Historical checkout snapshots and current operational facts, exclusively from the API. */
export function OrderCommerce({ data }: { data: OrderDetailResponse }) {
  const { t } = useI18n();
  const { commerce, lines } = data;
  const customer = commerce?.customer;
  const delivery = commerce?.delivery;
  const payment = commerce?.payment;

  return (
    <>
      <Surface>
        <View style={commerceStyles.sectionLead}>
          <View style={commerceStyles.icon}>
            <AppIcon name="account-details-outline" size={22} color={colors.brand} />
          </View>
          <View style={commerceStyles.copy}>
            <Text style={commerceStyles.cardTitle}>{t("orderCommerce.snapshot")}</Text>
            <Body>{t("orderCommerce.snapshotBody")}</Body>
          </View>
        </View>
      </Surface>

      <FormSection title={t("orderCommerce.customerSection")} icon="account-outline">
        {customer ? (
          <View>
            <InfoRow label={t("orderCommerce.name")} value={customer.name} />
            <InfoRow label={t("orderCommerce.phone")} value={customer.phone} />
            <InfoRow
              label={t("orderCommerce.email")}
              value={customer.email ?? t("orderCommerce.notProvided")}
            />
          </View>
        ) : (
          <Body>{t("orderCommerce.customerUnavailable")}</Body>
        )}
      </FormSection>

      <FormSection title={t("orderCommerce.deliverySection")} icon="truck-delivery-outline">
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
      </FormSection>

      <Surface>
        <SectionHeading
          title={t("orderCommerce.paymentSection")}
          detail={t("orderCommerce.recordedState")}
        />
        {payment ? (
          <View style={commerceStyles.payment}>
            <Badge label={payment.status} testID="order-payment-status" />
            <InfoRow
              label={t("orderCommerce.method")}
              value={t(paymentMethodKey[payment.method])}
            />
            <InfoRow
              label={t("orderCommerce.paymentAmount")}
              value={formatMoneyMinor(payment.amountMinor, payment.currency)}
            />
            {payment.provider ? (
              <InfoRow label={t("orderCommerce.provider")} value={payment.provider} />
            ) : null}
            {payment.method === "cash_on_delivery" && payment.status === "pending" ? (
              <Notice tone="warning" message={t("orderCommerce.codPending")} />
            ) : null}
          </View>
        ) : (
          <Body>{t("orderCommerce.paymentUnavailable")}</Body>
        )}
      </Surface>

      <Surface tone="accent">
        <SectionHeading
          title={t("orderCommerce.stockCommitment")}
          detail={t("orderCommerce.reservationState")}
        />
        {commerce && commerce.reservations.length > 0 ? (
          <View style={commerceStyles.reservations}>
            {commerce.reservations.map((reservation, index) => {
              const line = lines.find((item) => item.variantId === reservation.variantId);
              return (
                <SurfaceRow
                  key={`${reservation.variantId}-${reservation.inventoryLocationId}-${index}`}
                >
                  <View style={commerceStyles.reservationCopy}>
                    <Body>
                      {line ? `${line.productName} · ${line.sku}` : t("orderCommerce.orderItem")}
                    </Body>
                    <Badge
                      label={t(reservationKey[reservation.status])}
                      testID={`order-reservation-${index}`}
                    />
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
                </SurfaceRow>
              );
            })}
          </View>
        ) : (
          <Body>{t("orderCommerce.noStockCommitment")}</Body>
        )}
      </Surface>
    </>
  );
}

const commerceStyles = StyleSheet.create({
  sectionLead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  icon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  copy: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  payment: { gap: spacing.sm },
  reservations: { gap: spacing.md },
  reservationCopy: { flex: 1, gap: spacing.sm },
});

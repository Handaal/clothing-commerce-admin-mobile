import type { OrderCommerceDetails, OrderDetailResponse } from "@shifted/clothing-commerce-sdk";
import { StyleSheet, Text, View } from "react-native";

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

const paymentMethods: Record<NonNullable<OrderCommerceDetails["payment"]>["method"], string> = {
  cash: "Cash",
  cash_on_delivery: "Cash on delivery",
  electronic: "Electronic",
};

const reservationLabels: Record<OrderCommerceDetails["reservations"][number]["status"], string> = {
  active: "Stock reserved",
  consumed: "Consumed / fulfilled",
  released: "Released",
  expired: "Expired — needs attention",
};

/** Historical checkout snapshots and current operational facts, exclusively from the API. */
export function OrderCommerce({ data }: { data: OrderDetailResponse }) {
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
            <Text style={commerceStyles.cardTitle}>Order snapshot</Text>
            <Body>
              Contact and delivery details recorded at checkout, separate from a customer profile.
            </Body>
          </View>
        </View>
      </Surface>

      <FormSection title="Customer / contact" icon="account-outline">
        {customer ? (
          <View>
            <InfoRow label="Name" value={customer.name} />
            <InfoRow label="Phone" value={customer.phone} />
            <InfoRow label="Email" value={customer.email ?? "Not provided"} />
          </View>
        ) : (
          <Body>Customer snapshot is not available for this order.</Body>
        )}
      </FormSection>

      <FormSection title="Delivery" icon="truck-delivery-outline">
        {delivery ? (
          <View>
            <InfoRow label="Recipient" value={delivery.recipientName} />
            <InfoRow label="Delivery phone" value={delivery.phone} />
            <InfoRow label="Address" value={delivery.line1} />
            {delivery.line2 ? <InfoRow label="Address continued" value={delivery.line2} /> : null}
            <InfoRow label="City" value={delivery.city} />
            {delivery.region ? <InfoRow label="Region" value={delivery.region} /> : null}
            {delivery.postalCode ? (
              <InfoRow label="Postal code" value={delivery.postalCode} />
            ) : null}
            <InfoRow label="Country" value={delivery.countryCode} />
            {delivery.notes ? <InfoRow label="Delivery notes" value={delivery.notes} /> : null}
          </View>
        ) : (
          <Body>Delivery snapshot is not available for this order.</Body>
        )}
      </FormSection>

      <Surface>
        <SectionHeading title="Payment" detail="Recorded state" />
        {payment ? (
          <View style={commerceStyles.payment}>
            <Badge label={payment.status} testID="order-payment-status" />
            <InfoRow label="Method" value={paymentMethods[payment.method]} />
            <InfoRow
              label="Payment amount"
              value={formatMoneyMinor(payment.amountMinor, payment.currency)}
            />
            {payment.provider ? <InfoRow label="Provider" value={payment.provider} /> : null}
            {payment.method === "cash_on_delivery" && payment.status === "pending" ? (
              <Notice
                tone="warning"
                message="Cash on delivery is pending. Payment has not been recorded as captured."
              />
            ) : null}
          </View>
        ) : (
          <Body>Payment information is not available for this order.</Body>
        )}
      </Surface>

      <Surface tone="accent">
        <SectionHeading title="Stock commitment" detail="Reservation state" />
        {commerce && commerce.reservations.length > 0 ? (
          <View style={commerceStyles.reservations}>
            {commerce.reservations.map((reservation, index) => {
              const line = lines.find((item) => item.variantId === reservation.variantId);
              return (
                <SurfaceRow
                  key={`${reservation.variantId}-${reservation.inventoryLocationId}-${index}`}
                >
                  <View style={commerceStyles.reservationCopy}>
                    <Body>{line ? `${line.productName} · ${line.sku}` : "Order item"}</Body>
                    <Badge
                      label={reservationLabels[reservation.status]}
                      testID={`order-reservation-${index}`}
                    />
                    <InfoRow label="Committed quantity" value={String(reservation.quantity)} />
                    <InfoRow
                      label="Consumed quantity"
                      value={String(reservation.consumedQuantity)}
                    />
                    {reservation.expiresAt ? (
                      <InfoRow label="Expires" value={reservation.expiresAt} />
                    ) : null}
                  </View>
                </SurfaceRow>
              );
            })}
          </View>
        ) : (
          <Body>No stock commitment information supplied for this order.</Body>
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

import type { OrderCommerceDetails, OrderDetailResponse } from "@shifted/clothing-commerce-sdk";
import { View } from "react-native";

import { formatMoneyMinor } from "../products/display";
import { Badge, Body, Divider, Eyebrow, InfoRow, SurfaceRow, Title } from "../ui/components";

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
      <Divider />
      <Eyebrow>Order snapshot</Eyebrow>
      <Body>
        Contact and delivery details recorded at checkout, separate from a customer profile.
      </Body>
      <Title>Customer / contact</Title>
      {customer ? (
        <View>
          <InfoRow label="Name" value={customer.name} />
          <InfoRow label="Phone" value={customer.phone} />
          <InfoRow label="Email" value={customer.email ?? "Not provided"} />
        </View>
      ) : (
        <Body>Customer snapshot is not available for this order.</Body>
      )}

      <Title>Delivery</Title>
      {delivery ? (
        <View>
          <InfoRow label="Recipient" value={delivery.recipientName} />
          <InfoRow label="Delivery phone" value={delivery.phone} />
          <InfoRow label="Address" value={delivery.line1} />
          {delivery.line2 ? <InfoRow label="Address continued" value={delivery.line2} /> : null}
          <InfoRow label="City" value={delivery.city} />
          {delivery.region ? <InfoRow label="Region" value={delivery.region} /> : null}
          {delivery.postalCode ? <InfoRow label="Postal code" value={delivery.postalCode} /> : null}
          <InfoRow label="Country" value={delivery.countryCode} />
          {delivery.notes ? <InfoRow label="Delivery notes" value={delivery.notes} /> : null}
        </View>
      ) : (
        <Body>Delivery snapshot is not available for this order.</Body>
      )}

      <Divider />
      <Eyebrow>Payment</Eyebrow>
      {payment ? (
        <View style={{ gap: 8 }}>
          <Badge label={payment.status} testID="order-payment-status" />
          <InfoRow label="Method" value={paymentMethods[payment.method]} />
          <InfoRow
            label="Payment amount"
            value={formatMoneyMinor(payment.amountMinor, payment.currency)}
          />
          {payment.provider ? <InfoRow label="Provider" value={payment.provider} /> : null}
          {payment.method === "cash_on_delivery" && payment.status === "pending" ? (
            <Body>Cash on delivery is pending. Payment has not been recorded as captured.</Body>
          ) : null}
        </View>
      ) : (
        <Body>Payment information is not available for this order.</Body>
      )}

      <Divider />
      <Eyebrow>Stock commitment</Eyebrow>
      {commerce && commerce.reservations.length > 0 ? (
        commerce.reservations.map((reservation, index) => {
          const line = lines.find((item) => item.variantId === reservation.variantId);
          return (
            <SurfaceRow
              key={`${reservation.variantId}-${reservation.inventoryLocationId}-${index}`}
            >
              <Body>{line ? `${line.productName} · ${line.sku}` : "Order item"}</Body>
              <Badge
                label={reservationLabels[reservation.status]}
                testID={`order-reservation-${index}`}
              />
              <InfoRow label="Committed quantity" value={String(reservation.quantity)} />
              <InfoRow label="Consumed quantity" value={String(reservation.consumedQuantity)} />
              {reservation.expiresAt ? (
                <InfoRow label="Expires" value={reservation.expiresAt} />
              ) : null}
            </SurfaceRow>
          );
        })
      ) : (
        <Body>No stock commitment information supplied for this order.</Body>
      )}
    </>
  );
}

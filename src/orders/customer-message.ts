import {
  orderConfirmationMessage,
  smsLink,
  whatsAppLink,
  type MeContextResponse,
  type MessageLanguage,
  type OrderDetailResponse,
} from "@shifted/clothing-commerce-sdk";

import { formatMoneyMinor } from "../products/display";

export interface ConfirmationLinks {
  /** The message as it will appear (for preview). */
  text: string;
  whatsApp: string | null;
  sms: string | null;
  phone: string;
}

/** The brand the customer bought from, else the business name. */
export function storeNameFor(context: MeContextResponse | null, brandId: string): string {
  const brand = context?.access.catalog.brands.find((candidate) => candidate.id === brandId);
  return brand?.name ?? context?.tenant.name ?? "";
}

/**
 * Click-to-chat confirmation for an online order (SDK 0.48 wording, EN/AR). Free: WhatsApp or the
 * Messages app opens on this device with the text filled in; staff press send. Null when the order has
 * no usable customer phone.
 */
export function confirmationLinks(
  detail: OrderDetailResponse,
  options: { storeName: string; language: MessageLanguage; storefrontUrl?: string | undefined },
): ConfirmationLinks | null {
  const customer = detail.commerce?.customer;
  const phone = customer?.phone ?? detail.commerce?.delivery?.phone;
  if (!phone) return null;
  const text = orderConfirmationMessage({
    storeName: options.storeName || "our store",
    orderReference: detail.header.orderNumber,
    customerName: customer?.name ?? detail.commerce?.delivery?.recipientName ?? null,
    totalLabel: formatMoneyMinor(detail.header.totalMinor, detail.header.currency),
    deliveryCity: detail.commerce?.delivery?.city ?? null,
    trackingUrl: options.storefrontUrl
      ? `${options.storefrontUrl}/track?order=${encodeURIComponent(detail.header.orderNumber)}`
      : null,
    language: options.language,
  });
  const whatsApp = whatsAppLink(phone, text);
  const sms = smsLink(phone, text);
  if (!whatsApp && !sms) return null;
  return { text, whatsApp, sms, phone };
}

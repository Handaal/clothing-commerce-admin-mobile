import type { OrderDetailResponse } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it } from "vitest";

import { meContext, TENANT_A } from "../test-support/fixtures";
import { confirmationLinks, storeNameFor } from "./customer-message";

function detail(phone: string | null): OrderDetailResponse {
  return {
    header: {
      id: "d1000000-0000-4000-8000-000000000001",
      orderNumber: "1042",
      channel: "online",
      status: "placed",
      brandId: "e1000000-0000-4000-8000-000000000001",
      branchId: null,
      currency: "EGP",
      totalMinor: 125000,
      placedAt: "2026-11-19T10:00:00.000Z",
    },
    lines: [],
    cancellation: null,
    fulfillmentProgress: { status: "unfulfilled", lines: [] },
    commerce: {
      customerId: "f1000000-0000-4000-8000-000000000001",
      customer: phone ? { name: "Omar Hassan", email: null, phone } : null,
      delivery: null,
      payment: null,
      reservations: [],
    },
  };
}

describe("order confirmation links", () => {
  it("builds WhatsApp and SMS links with the order details and tracking page", () => {
    const links = confirmationLinks(detail("+20 100 123 4567"), {
      storeName: "Zee Store",
      language: "en",
      storefrontUrl: "https://zee.example",
    })!;
    expect(links.text).toContain("Hi Omar,");
    expect(links.text).toContain("#1042");
    expect(links.text).toContain("https://zee.example/track?order=1042");
    expect(links.whatsApp).toMatch(/^https:\/\/wa\.me\/201001234567\?text=/u);
    expect(links.sms).toMatch(/^sms:\+201001234567\?body=/u);
  });

  it("writes Arabic when the app is in Arabic", () => {
    const links = confirmationLinks(detail("+201001234567"), { storeName: "Zee", language: "ar" })!;
    expect(links.text.startsWith("أهلاً Omar،")).toBe(true);
    expect(links.text).not.toContain("/track");
  });

  it("offers nothing without a usable phone", () => {
    expect(confirmationLinks(detail(null), { storeName: "Zee", language: "en" })).toBeNull();
  });

  it("names the brand, else the business", () => {
    const context = meContext(TENANT_A);
    expect(storeNameFor(context, "unknown-brand")).toBe(context.tenant.name);
    expect(storeNameFor(null, "x")).toBe("");
  });
});

import { createCommerceClient } from "@shifted/clothing-commerce-sdk";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { SessionProvider, useSession } from "../src/session/SessionProvider";
import { SiteTextScreen } from "../src/storefront/SiteTextScreen";
import { createMemoryTenantStorage } from "../src/tenant/storage";

// Site text (SDK 0.52) through the REAL Admin Mobile screen: session bootstrap, /me/context, the SDK and
// every HTTP request hit the disposable loopback API. Only the device auth/storage adapters are replaced.
// Run by the cross-repo website acceptance (website-site-text-acceptance.mjs); Admin Mobile edits first,
// then the POS edits on top, then the real Storefront is checked.
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "runtime-user",
    sessionId: "runtime-session",
    getToken: async () => process.env.ONLINE_TEST_TOKEN,
    signOut: async () => {},
  }),
}));
// expo-crypto pulls in Expo's runtime, which does not load under Node (this also breaks the other
// runtime suites today); Node's own crypto gives the same real random idempotency keys.
vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock("../src/tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

const tenantId = "2a000001-0000-4000-8000-000000000001";
let baseUrl = "";

beforeAll(() => {
  baseUrl = process.env.ONLINE_TEST_URL ?? "";
  if (
    !baseUrl ||
    !process.env.ONLINE_TEST_TOKEN ||
    !/^http:\/\/(127\.0\.0\.1|localhost):/.test(baseUrl)
  ) {
    throw new Error(
      "Supply the disposable loopback API and its test session; never use production.",
    );
  }
  process.env.EXPO_PUBLIC_COMMERCE_API_URL = baseUrl;
  configure({ asyncUtilTimeout: 15000 });
});

afterEach(cleanup);

function Harness() {
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <span>{state.phase}</span>;
  return (
    <SiteTextScreen
      client={getTenantClient(state.tenantId)}
      canManage={state.context.access.catalog.canRead}
      onBack={() => {}}
    />
  );
}

const input = (testId: string) =>
  (screen.getByTestId(testId).querySelector("input, textarea") ??
    screen.getByTestId(testId)) as HTMLInputElement;

it("edits the website text in Admin Mobile and the API serves it publicly", async () => {
  render(
    <SessionProvider storage={createMemoryTenantStorage(tenantId)}>
      <Harness />
    </SessionProvider>,
  );
  await screen.findByTestId("site-text-group-identity", undefined, { timeout: 30000 });

  fireEvent.change(input("site-text-storeName"), { target: { value: "Nile Wear" } });
  fireEvent.change(input("site-text-seoDescription"), {
    target: { value: "Linen and cotton for hot days, cash on delivery." },
  });
  fireEvent.change(input("site-text-footerTagline"), { target: { value: "Made for the heat." } });
  fireEvent.change(input("site-text-newArrivalsTitle"), {
    target: { value: "Fresh off the rail" },
  });
  fireEvent.change(input("site-text-brandNoteTitle"), {
    target: { value: "Cool cotton, warm welcome." },
  });
  fireEvent.change(input("site-text-contactEmail"), {
    target: { value: "hello@nilewear.example" },
  });
  // Promo bar: customize, edit the first message, drop the last one.
  fireEvent.click(screen.getByTestId("site-text-announcements-customize"));
  fireEvent.change(input("site-text-announcements-0"), {
    target: { value: "Mobile promo: free returns" },
  });
  fireEvent.click(screen.getByTestId("site-text-announcements-2-remove"));
  // FAQ: customize and rewrite the first question.
  fireEvent.click(screen.getByTestId("site-text-faqItems-customize"));
  fireEvent.change(input("site-text-faqItems-0-a"), {
    target: { value: "Do you deliver to Aswan?" },
  });
  fireEvent.change(input("site-text-faqItems-0-b"), {
    target: { value: "Yes — every governorate. See [shipping](/shipping-returns)." },
  });
  fireEvent.click(screen.getByTestId("site-text-save"));

  // The real API saved it: the public read the website uses now carries the mobile edits.
  const publicSdk = createCommerceClient({ baseUrl });
  await waitFor(
    async () => {
      const { siteText } = await publicSdk.getPublicStorefrontSiteText({ tenantId });
      expect(siteText.storeName).toBe("Nile Wear");
    },
    { timeout: 15000 },
  );
  const { siteText } = await publicSdk.getPublicStorefrontSiteText({ tenantId });
  expect(siteText).toMatchObject({
    footerTagline: "Made for the heat.",
    newArrivalsTitle: "Fresh off the rail",
    contactEmail: "hello@nilewear.example",
    announcements: ["Mobile promo: free returns", "Delivery across Egypt"],
  });
  expect(siteText.faqItems?.[0]?.question).toBe("Do you deliver to Aswan?");
  expect(siteText).not.toHaveProperty("faqTitle");

  // The screen reflects the saved document (nothing left to save).
  await waitFor(() =>
    expect(screen.getByTestId("site-text-save").getAttribute("aria-disabled")).toBe("true"),
  );
});

it("an invalid value is refused in the app and nothing changes on the server", async () => {
  render(
    <SessionProvider storage={createMemoryTenantStorage(tenantId)}>
      <Harness />
    </SessionProvider>,
  );
  await screen.findByTestId("site-text-group-identity", undefined, { timeout: 30000 });
  // Reopening shows what was saved before.
  expect(input("site-text-storeName").value).toBe("Nile Wear");
  fireEvent.change(input("site-text-brandNoteCtaHref"), {
    target: { value: "javascript:alert(1)" },
  });
  fireEvent.click(screen.getByTestId("site-text-save"));
  expect(
    await screen.findByText("Use an internal path such as /catalog, or an https:// link."),
  ).toBeDefined();
  const { siteText } = await createCommerceClient({ baseUrl }).getPublicStorefrontSiteText({
    tenantId,
  });
  expect(siteText).not.toHaveProperty("brandNoteCtaHref");
});

// @vitest-environment jsdom
import { SITE_TEXT_GROUPS, type StorefrontSiteText } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "mock-uuid" }));

import { setLocale } from "../i18n/store";
import { SiteTextScreen, type SiteTextClient } from "./SiteTextScreen";

afterEach(() => {
  cleanup();
  setLocale("en");
});

function fakeClient(initial: StorefrontSiteText = { siteText: {}, updatedAt: null }) {
  const update = vi.fn(
    async ({ siteText }: { siteText: Record<string, unknown>; idempotencyKey: string }) => ({
      siteText: Object.fromEntries(Object.entries(siteText).filter(([, v]) => v !== null)),
      updatedAt: "2026-11-24T10:00:00.000Z",
    }),
  );
  const client = {
    getStorefrontSiteText: vi.fn(async () => initial),
    updateStorefrontSiteText: update,
  } as unknown as SiteTextClient;
  return { client, update };
}

function renderScreen(client: SiteTextClient, canManage = true) {
  return render(
    <SiteTextScreen
      client={client}
      canManage={canManage}
      onBack={() => {}}
      generateIdempotencyKey={() => "key-1"}
    />,
  );
}

const input = (testId: string) =>
  screen.getByTestId(testId).querySelector("input, textarea") ??
  (screen.getByTestId(testId) as HTMLInputElement);

describe("SiteTextScreen", () => {
  it("shows every group, with the built-in text as placeholders", async () => {
    const { client } = fakeClient();
    renderScreen(client);
    for (const group of SITE_TEXT_GROUPS) {
      expect(await screen.findByTestId(`site-text-group-${group.id}`)).toBeDefined();
    }
    expect(input("site-text-newArrivalsTitle").getAttribute("placeholder")).toBe("New arrivals");
    expect(input("site-text-faqIntro").getAttribute("placeholder")).toContain("Zee Store");
    expect(screen.getByTestId("site-text-save").getAttribute("aria-disabled")).toBe("true");
  });

  it("saves text fields and a customized promo list exactly as edited", async () => {
    const { client, update } = fakeClient();
    renderScreen(client);
    fireEvent.change(
      input(await screen.findByTestId("site-text-storeName").then(() => "site-text-storeName")),
      {
        target: { value: "Nile Wear" },
      },
    );
    fireEvent.change(input("site-text-footerTagline"), { target: { value: "Made for the heat." } });
    fireEvent.click(screen.getByTestId("site-text-announcements-customize"));
    fireEvent.change(input("site-text-announcements-0"), { target: { value: "Free returns" } });
    fireEvent.click(screen.getByTestId("site-text-announcements-2-remove"));
    fireEvent.click(screen.getByTestId("site-text-save"));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const sent = update.mock.calls[0]![0];
    expect(sent.idempotencyKey).toBe("key-1");
    expect(sent.siteText).toMatchObject({
      storeName: "Nile Wear",
      footerTagline: "Made for the heat.",
      announcements: ["Free returns", "Delivery across Egypt"],
      faqItems: null,
      newArrivalsTitle: null,
    });
    // After saving, the form matches the saved document again (nothing left to save).
    await waitFor(() =>
      expect(screen.getByTestId("site-text-save").getAttribute("aria-disabled")).toBe("true"),
    );
  });

  it("an emptied FAQ is saved as an empty list; 'use built-in' sends null", async () => {
    const { client, update } = fakeClient({
      siteText: { faqItems: [{ question: "Q1?", answer: "A1." }] },
      updatedAt: "2026-11-23T10:00:00.000Z",
    });
    renderScreen(client);
    fireEvent.click(await screen.findByTestId("site-text-faqItems-0-remove"));
    fireEvent.click(screen.getByTestId("site-text-termsSections-customize"));
    fireEvent.click(screen.getByTestId("site-text-termsSections-reset"));
    fireEvent.click(screen.getByTestId("site-text-save"));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]![0].siteText).toMatchObject({ faqItems: [], termsSections: null });
  });

  it("blocks saving and explains invalid values", async () => {
    const { client, update } = fakeClient();
    renderScreen(client);
    fireEvent.change(
      input(
        await screen.findByTestId("site-text-contactEmail").then(() => "site-text-contactEmail"),
      ),
      {
        target: { value: "not-an-email" },
      },
    );
    fireEvent.change(input("site-text-brandNoteCtaHref"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByTestId("site-text-save"));
    expect(await screen.findByText("Enter a valid email address.")).toBeDefined();
    expect(
      screen.getByText("Use an internal path such as /catalog, or an https:// link."),
    ).toBeDefined();
    expect(update).not.toHaveBeenCalled();
  });

  it("shows Arabic labels when the app is in Arabic", async () => {
    setLocale("ar");
    const { client } = fakeClient();
    renderScreen(client);
    expect(await screen.findByText("الشريط الترويجي")).toBeDefined();
    expect(screen.getByText("اسم المتجر")).toBeDefined();
  });

  it("explains missing access instead of loading", () => {
    const { client } = fakeClient();
    renderScreen(client, false);
    expect(screen.getByText("No access to website text")).toBeDefined();
    expect(client.getStorefrontSiteText).not.toHaveBeenCalled();
  });
});

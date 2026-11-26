import { createCommerceClient } from "@shifted/clothing-commerce-sdk";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { CollectionManageScreen } from "../src/collections/CollectionManageScreen";
import { ProductManageScreen } from "../src/products/ProductManageScreen";
import { SessionProvider, useSession } from "../src/session/SessionProvider";
import { createMemoryTenantStorage } from "../src/tenant/storage";

// Website catalog editing (SDK 0.53) through the REAL Admin Mobile screens against the disposable
// loopback API: rename a collection (name, web address, description) and edit a product's photos
// (description, main photo, order). Run by website-site-text-acceptance.mjs after the API suite, which
// leaves a "Summer Edit 26" collection and a product with two photos.
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
vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock("../src/tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

const tenantId = "2a000001-0000-4000-8000-000000000001";
const productId = "2a000006-0000-4000-8000-000000000001";
let baseUrl = "";
let sdk: ReturnType<ReturnType<typeof createCommerceClient>["withTenant"]>;

beforeAll(() => {
  baseUrl = process.env.ONLINE_TEST_URL ?? "";
  if (
    !baseUrl ||
    !process.env.ONLINE_TEST_TOKEN ||
    !/^http:\/\/(127\.0\.0\.1|localhost):/.test(baseUrl)
  )
    throw new Error(
      "Supply the disposable loopback API and its test session; never use production.",
    );
  process.env.EXPO_PUBLIC_COMMERCE_API_URL = baseUrl;
  configure({ asyncUtilTimeout: 15000 });
  sdk = createCommerceClient({ baseUrl, getToken: () => process.env.ONLINE_TEST_TOKEN }).withTenant(
    tenantId,
  );
});

afterEach(cleanup);

function Screen({ which, id }: { which: "collection" | "product"; id: string }) {
  const { state } = useSession();
  if (state.phase !== "ready") return <span>{state.phase}</span>;
  return which === "collection" ? (
    <CollectionManageScreen tenantId={state.tenantId} collectionId={id} onBack={() => {}} />
  ) : (
    <ProductManageScreen tenantId={state.tenantId} productId={id} onBack={() => {}} />
  );
}

const mount = (which: "collection" | "product", id: string) =>
  render(
    <SessionProvider storage={createMemoryTenantStorage(tenantId)}>
      <Screen which={which} id={id} />
    </SessionProvider>,
  );

it("renames a collection in Admin Mobile and the website serves the new name and address", async () => {
  const { collections } = await sdk.listCollections();
  const target = collections.find((c) => c.name === "Summer Edit 26");
  if (!target) throw new Error("The API suite's collection is missing.");
  mount("collection", target.id);
  fireEvent.change(await screen.findByTestId("collection-name", undefined, { timeout: 30000 }), {
    target: { value: "Linen Drop" },
  });
  fireEvent.change(screen.getByTestId("collection-slug"), { target: { value: "linen-drop" } });
  fireEvent.change(screen.getByTestId("collection-description"), {
    target: { value: "Mobile: breathable pieces for August." },
  });
  fireEvent.click(screen.getByTestId("collection-details-save"));
  const pub = createCommerceClient({ baseUrl });
  await waitFor(
    async () => {
      const detail = await pub.getPublishedCollection({ tenantId, slug: "linen-drop" });
      expect(detail).toMatchObject({
        name: "Linen Drop",
        description: "Mobile: breathable pieces for August.",
      });
    },
    { timeout: 15000 },
  );
});

it("edits product photos in Admin Mobile: description, main photo and order", async () => {
  const before = (await sdk.listProductMedia(productId)).media;
  expect(before.length).toBeGreaterThanOrEqual(2);
  const [first, second] = before as [(typeof before)[number], (typeof before)[number]];
  mount("product", productId);
  fireEvent.click(await screen.findByTestId("section-media", undefined, { timeout: 30000 }));
  await screen.findByTestId(`media-${second.id}`);

  fireEvent.change(screen.getByTestId(`media-alt-${second.id}`), {
    target: { value: "Mobile: folded on a chair" },
  });
  fireEvent.click(screen.getByTestId(`media-alt-save-${second.id}`));
  await waitFor(async () => {
    const media = (await sdk.listProductMedia(productId)).media;
    expect(media.find((m) => m.id === second.id)?.altText).toBe("Mobile: folded on a chair");
  });

  fireEvent.click(await screen.findByTestId(`media-main-${second.id}`));
  await waitFor(async () => {
    const media = (await sdk.listProductMedia(productId)).media;
    expect(media[0]).toMatchObject({ id: second.id, isPrimary: true });
  });

  // Move the (now second) original first photo back to the top: it becomes the main photo again.
  fireEvent.click(await screen.findByTestId(`media-up-${first.id}`));
  await waitFor(async () => {
    const media = (await sdk.listProductMedia(productId)).media;
    expect(media.map((m) => m.id)).toEqual([first.id, second.id]);
    expect(media[0]!.isPrimary).toBe(true);
  });
});

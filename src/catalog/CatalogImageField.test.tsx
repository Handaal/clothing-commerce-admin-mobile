// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogImageField, type CatalogImageClient } from "./CatalogImageField";
import type { PickedImage } from "./media";

afterEach(cleanup);

const picked: PickedImage = { body: "bytes", contentType: "image/webp", fileName: "cover.webp" };

function setup(image: { bucket: string; path: string; altText: string | null } | null = null) {
  const client = {
    createCatalogImageIntent: vi.fn(async () => ({
      bucket: "product-media",
      path: "t/catalog/abc.webp",
      contentType: "image/webp",
      uploadUrl: "https://storage.example/signed",
      expiresAt: null,
    })),
  } as unknown as CatalogImageClient;
  const onSave = vi.fn(async () => {});
  const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
  render(
    <CatalogImageField
      client={client}
      label="Cover image"
      hint="Shown on the card."
      image={image}
      onSave={onSave}
      imagePicker={async () => picked}
      fetchImpl={fetchImpl}
      testID="cover"
    />,
  );
  return { client, onSave, fetchImpl };
}

describe("CatalogImageField", () => {
  it("uploads to the server-chosen destination and saves it", async () => {
    const { client, onSave, fetchImpl } = setup();
    expect(screen.getByText("No image yet — the website uses a product photo.")).toBeDefined();
    fireEvent.click(screen.getByTestId("cover-pick"));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        bucket: "product-media",
        path: "t/catalog/abc.webp",
        altText: null,
      }),
    );
    expect(client.createCatalogImageIntent).toHaveBeenCalledWith({
      contentType: "image/webp",
      fileName: "cover.webp",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://storage.example/signed",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("removes the image and saves a new description", async () => {
    const { onSave } = setup({ bucket: "product-media", path: "t/catalog/x.webp", altText: null });
    fireEvent.change(screen.getByTestId("cover-alt"), {
      target: { value: "Linen rail" },
    });
    fireEvent.click(screen.getByTestId("cover-alt-save"));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        bucket: "product-media",
        path: "t/catalog/x.webp",
        altText: "Linen rail",
      }),
    );
    fireEvent.click(screen.getByTestId("cover-remove"));
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(null));
  });
});

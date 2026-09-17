import { describe, expect, it, vi } from "vitest";

import {
  MediaStorageUnavailableError,
  MediaUploadFailedError,
  prepareMediaUpload,
  toImageContentType,
  type PickedImage,
} from "./media";

const image: PickedImage = {
  body: "bytes",
  contentType: "image/jpeg",
  fileName: "shot.jpg",
};

describe("prepareMediaUpload", () => {
  it("requests an intent then PUTs the bytes to the signed URL, returning bucket/path", async () => {
    const client = {
      createProductMediaUploadIntent: vi.fn().mockResolvedValue({
        bucket: "media",
        path: "tenant/p1/abc.jpg",
        contentType: "image/jpeg",
        uploadUrl: "https://signed.example/upload",
        expiresAt: "2026-09-17T00:00:00Z",
      }),
    };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await prepareMediaUpload(
      client as never,
      { productId: "p1", image },
      fetchImpl as never,
    );

    expect(client.createProductMediaUploadIntent).toHaveBeenCalledWith({
      productId: "p1",
      contentType: "image/jpeg",
      fileName: "shot.jpg",
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://signed.example/upload", {
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      body: "bytes",
    });
    expect(result).toEqual({ bucket: "media", path: "tenant/p1/abc.jpg" });
  });

  it("passes an optional variantId to the intent", async () => {
    const client = {
      createProductMediaUploadIntent: vi.fn().mockResolvedValue({
        bucket: "media",
        path: "p",
        contentType: "image/jpeg",
        uploadUrl: "https://x",
        expiresAt: null,
      }),
    };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await prepareMediaUpload(
      client as never,
      { productId: "p1", variantId: "v1", image },
      fetchImpl as never,
    );
    expect(client.createProductMediaUploadIntent).toHaveBeenCalledWith(
      expect.objectContaining({ variantId: "v1" }),
    );
  });

  it("isolates a missing signed URL as a storage-unavailable gap (no PUT attempted)", async () => {
    const client = {
      createProductMediaUploadIntent: vi.fn().mockResolvedValue({
        bucket: "media",
        path: "p",
        contentType: "image/jpeg",
        uploadUrl: null,
        expiresAt: null,
      }),
    };
    const fetchImpl = vi.fn();
    await expect(
      prepareMediaUpload(client as never, { productId: "p1", image }, fetchImpl as never),
    ).rejects.toBeInstanceOf(MediaStorageUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces a failed storage PUT", async () => {
    const client = {
      createProductMediaUploadIntent: vi.fn().mockResolvedValue({
        bucket: "media",
        path: "p",
        contentType: "image/jpeg",
        uploadUrl: "https://x",
        expiresAt: null,
      }),
    };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(
      prepareMediaUpload(client as never, { productId: "p1", image }, fetchImpl as never),
    ).rejects.toBeInstanceOf(MediaUploadFailedError);
  });
});

describe("toImageContentType", () => {
  it("accepts the allowed image types case-insensitively", () => {
    expect(toImageContentType("image/jpeg")).toBe("image/jpeg");
    expect(toImageContentType("IMAGE/PNG")).toBe("image/png");
    expect(toImageContentType("image/webp")).toBe("image/webp");
    expect(toImageContentType("image/avif")).toBe("image/avif");
  });

  it("rejects unsupported or missing types", () => {
    expect(toImageContentType("image/gif")).toBeNull();
    expect(toImageContentType("application/pdf")).toBeNull();
    expect(toImageContentType(undefined)).toBeNull();
    expect(toImageContentType(null)).toBeNull();
  });
});

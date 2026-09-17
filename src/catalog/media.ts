import { createMediaUploadIntent, type CreateMediaIntentClient } from "./operations";

/**
 * The Phase 2J media upload flow, kept as pure orchestration so the screen stays thin and the steps are
 * unit-testable. The contract's flow is:
 *
 *   1. request an authorized upload intent (`createProductMediaUploadIntent`) — the API returns a
 *      server-controlled `bucket` + `path` and, when storage is configured, a signed `uploadUrl`;
 *   2. PUT the selected image bytes to that signed URL (never to a client-chosen path);
 *   3. register the media metadata (`registerProductMedia`) against the SAME bucket/path;
 *   4. the caller refreshes the product and shows the media.
 *
 * Steps 1–2 are done here in {@link prepareMediaUpload} and are NOT idempotency-keyed (the intent mints a
 * fresh destination and is safe to repeat). Step 3 is the keyed, retryable mutation the screen runs via
 * `useMutation`, reusing the prepared bucket/path so an ambiguous retry sends an identical body.
 *
 * Raw image bytes never touch the API database — they go only to object storage via the signed URL.
 */

export type ImageContentType = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

export const ALLOWED_IMAGE_TYPES: readonly ImageContentType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

export interface PickedImage {
  /** The bytes to upload. On web this is the File/Blob; the fetch PUT accepts it directly. */
  body: BodyInit;
  contentType: ImageContentType;
  fileName?: string;
  /** A URI usable in an <Image> preview (an object URL on web). */
  previewUri?: string;
}

export type ImagePicker = () => Promise<PickedImage | null>;

/**
 * Raised when the API authorizes an upload intent but storage returned no signed `uploadUrl`. In local
 * development without Supabase Storage credentials this is the single, isolated environmental gap: the
 * intent request itself succeeded, so authorization and the rest of the contract are proven — only the
 * live object-storage PUT cannot be exercised.
 */
export class MediaStorageUnavailableError extends Error {
  constructor() {
    super(
      "The storage service did not return a signed upload URL, so the image bytes cannot be uploaded " +
        "in this environment. This is a storage-configuration gap, not a catalog error.",
    );
    this.name = "MediaStorageUnavailableError";
  }
}

export class MediaUploadFailedError extends Error {
  constructor(readonly status: number) {
    super(`Uploading the image to storage failed (HTTP ${status}). Please try again.`);
    this.name = "MediaUploadFailedError";
  }
}

export interface PreparedUpload {
  bucket: string;
  path: string;
}

export interface PrepareMediaUploadArgs {
  productId: string;
  variantId?: string;
  image: PickedImage;
}

/** Steps 1–2: authorize an intent, then PUT the bytes to the signed URL. */
export async function prepareMediaUpload(
  client: CreateMediaIntentClient,
  { productId, variantId, image }: PrepareMediaUploadArgs,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<PreparedUpload> {
  const intent = await createMediaUploadIntent(client, {
    productId,
    ...(variantId ? { variantId } : {}),
    contentType: image.contentType,
    ...(image.fileName ? { fileName: image.fileName } : {}),
  });

  if (!intent.uploadUrl) {
    throw new MediaStorageUnavailableError();
  }

  const response = await fetchImpl(intent.uploadUrl, {
    method: "PUT",
    headers: { "content-type": intent.contentType },
    body: image.body,
  });
  if (!response.ok) {
    throw new MediaUploadFailedError(response.status);
  }

  return { bucket: intent.bucket, path: intent.path };
}

/** Map a MIME string from the OS/file picker to an allowed catalog image type, or null if unsupported. */
export function toImageContentType(mime: string | undefined | null): ImageContentType | null {
  const normalized = (mime ?? "").toLowerCase();
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(normalized)
    ? (normalized as ImageContentType)
    : null;
}

/**
 * Default web image picker using a transient file input. Guarded so it is a no-op off the web (native
 * builds would wire an Expo image picker here); the screen accepts an injected picker for tests.
 */
export const webImagePicker: ImagePicker = () =>
  new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ALLOWED_IMAGE_TYPES.join(",");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const contentType = toImageContentType(file.type);
      if (!contentType) {
        resolve(null);
        return;
      }
      resolve({
        body: file,
        contentType,
        fileName: file.name,
        previewUri: URL.createObjectURL(file),
      });
    };
    input.click();
  });

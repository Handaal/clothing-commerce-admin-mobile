// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadReportExportOnWeb, shareReportExportOnNative } from "./export-document";

const canonical = {
  body: 'name,notes\r\n"Linen, Shirt","line 1\r\nline 2"\r\n',
  mediaType: "text/csv",
  filename: "sales-products_2026-09-01_2026-09-30.csv",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("report export document handling", () => {
  it("preserves the canonical filename, media type, and opaque CSV body on web", () => {
    let blobParts: unknown[] = [];
    let blobType: string | undefined;
    class CapturingBlob {
      constructor(parts: unknown[], options?: { type?: string }) {
        blobParts = parts;
        blobType = options?.type;
      }
    }
    vi.stubGlobal("Blob", CapturingBlob);
    const createObjectURL = vi.fn(() => "blob:report");
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadReportExportOnWeb(canonical);

    expect(blobParts).toEqual([canonical.body]);
    expect(blobType).toBe(canonical.mediaType);
    expect((click.mock.instances[0] as HTMLAnchorElement | undefined)?.download).toBe(
      canonical.filename,
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  it("writes the opaque body under the canonical filename and shares its media type on native", async () => {
    const create = vi.fn();
    const write = vi.fn();
    const createFile = vi.fn(() => ({ uri: "file:///cache/canonical.csv", create, write }));
    const share = vi.fn(async () => undefined);

    await shareReportExportOnNative(canonical, {
      createFile,
      isSharingAvailable: async () => true,
      share,
    });

    expect(createFile).toHaveBeenCalledWith(canonical.filename);
    expect(create).toHaveBeenCalledWith({ overwrite: true });
    expect(write).toHaveBeenCalledWith(canonical.body);
    expect(share).toHaveBeenCalledWith("file:///cache/canonical.csv", {
      mimeType: canonical.mediaType,
      dialogTitle: `Share ${canonical.filename}`,
    });
  });
});

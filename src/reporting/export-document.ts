import { Platform } from "react-native";

import type { ReportExportDocument } from "./model";

export type SaveReportExport = (document: ReportExportDocument) => Promise<void>;

interface NativeFile {
  uri: string;
  create(options: { overwrite: boolean }): void;
  write(contents: string): void;
}

interface NativeExportDependencies {
  createFile(filename: string): NativeFile;
  isSharingAvailable(): Promise<boolean>;
  share(uri: string, options: { mimeType: string; dialogTitle: string }): Promise<void>;
}

/** Save on web or open the native share sheet. The SDK document is treated as opaque throughout. */
export const saveReportExport: SaveReportExport = async (document) => {
  if (Platform.OS === "web") {
    downloadReportExportOnWeb(document);
    return;
  }
  await shareReportExportOnNative(document);
};

export function downloadReportExportOnWeb(document: ReportExportDocument): void {
  const blob = new Blob([document.body], { type: document.mediaType });
  const objectUrl = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = objectUrl;
  link.download = document.filename;
  link.style.display = "none";
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function shareReportExportOnNative(
  document: ReportExportDocument,
  dependencies?: NativeExportDependencies,
): Promise<void> {
  const native = dependencies ?? (await nativeDependencies());
  const file = native.createFile(document.filename);
  file.create({ overwrite: true });
  file.write(document.body);

  if (!(await native.isSharingAvailable())) {
    throw new Error("Native sharing is unavailable on this device.");
  }

  await native.share(file.uri, {
    mimeType: document.mediaType,
    dialogTitle: `Share ${document.filename}`,
  });
}

async function nativeDependencies(): Promise<NativeExportDependencies> {
  const [{ File, Paths }, Sharing] = await Promise.all([
    import("expo-file-system"),
    import("expo-sharing"),
  ]);
  return {
    createFile: (filename) => new File(Paths.cache, filename),
    isSharingAvailable: Sharing.isAvailableAsync,
    share: Sharing.shareAsync,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { classifyCommerceError } from "../commerce/errors";
import { t as translate, useI18n } from "../i18n";
import { Body, PrimaryButton } from "../ui/components";
import type { ReportingAdapter } from "./adapter";
import { saveReportExport, type SaveReportExport } from "./export-document";
import type { ReportExportRequest } from "./model";

type ExportState =
  | { status: "idle" }
  | { status: "exporting" }
  | { status: "success"; filename: string }
  | { status: "failure"; message: string };

export function ReportExportAction({
  adapter,
  request,
  label,
  save = saveReportExport,
}: {
  adapter: ReportingAdapter;
  request: ReportExportRequest;
  label: string;
  save?: SaveReportExport;
}) {
  return (
    <ReportExportOperation
      key={exportRequestIdentity(request)}
      adapter={adapter}
      request={request}
      label={label}
      save={save}
    />
  );
}

function ReportExportOperation({
  adapter,
  request,
  label,
  save,
}: {
  adapter: ReportingAdapter;
  request: ReportExportRequest;
  label: string;
  save: SaveReportExport;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<ExportState>({ status: "idle" });
  const inFlight = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    return () => {
      sequence.current += 1;
      inFlight.current = false;
    };
  }, []);

  const run = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    const operation = ++sequence.current;
    setState({ status: "exporting" });

    adapter
      .exportReport(request)
      .then(async (document) => {
        await save(document);
        if (operation !== sequence.current) return;
        setState({ status: "success", filename: document.filename });
      })
      .catch((error: unknown) => {
        if (operation !== sequence.current) return;
        setState({ status: "failure", message: exportErrorMessage(error) });
      })
      .finally(() => {
        if (operation === sequence.current) inFlight.current = false;
      });
  }, [adapter, request, save]);

  return (
    <View style={{ gap: 6 }}>
      <PrimaryButton
        testID={`report-export-${request.dataset}`}
        label={state.status === "exporting" ? t("rpt.exportingCsv") : label}
        disabled={state.status === "exporting"}
        onPress={run}
      />
      {state.status === "success" ? (
        <Body testID="report-export-success">
          {t("rpt.exportReady", { filename: state.filename })}
        </Body>
      ) : null}
      {state.status === "failure" ? (
        <Body testID="report-export-error">{state.message}</Body>
      ) : null}
    </View>
  );
}

export function exportErrorMessage(error: unknown): string {
  const classified = classifyCommerceError(error);
  if (classified.code === "EXPORT_RANGE_TOO_LARGE") {
    return translate("rpt.exportRangeTooLarge");
  }
  if (classified.code === "EXPORT_TOO_MANY_ROWS") {
    return translate("rpt.exportTooManyRows");
  }

  switch (classified.kind) {
    case "auth":
      return translate("rpt.exportAuth");
    case "forbidden":
      return translate("rpt.exportForbidden");
    case "validation":
      return translate("rpt.exportValidation");
    case "network":
      return translate("rpt.exportNetwork");
    case "contract":
      return translate("rpt.exportContract");
    case "server":
      return translate("rpt.exportServer");
    case "not-found":
    case "unknown":
    default:
      return translate("rpt.exportGeneric");
  }
}

function exportRequestIdentity(request: ReportExportRequest): string {
  return [
    request.dataset,
    request.range.preset,
    request.range.from ?? "",
    request.range.to ?? "",
    "level" in request ? request.level : "",
  ].join(":");
}

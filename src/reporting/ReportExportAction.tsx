import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { classifyCommerceError } from "../commerce/errors";
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
        label={state.status === "exporting" ? "Exporting CSV…" : label}
        disabled={state.status === "exporting"}
        onPress={run}
      />
      {state.status === "success" ? (
        <Body testID="report-export-success">Export ready: {state.filename}</Body>
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
    return "The selected date range is too large. Shorten it and export again.";
  }
  if (classified.code === "EXPORT_TOO_MANY_ROWS") {
    return "This export contains too many rows. Narrow the date range or filters and try again.";
  }

  switch (classified.kind) {
    case "auth":
      return "Your session has expired. Sign in again before exporting.";
    case "forbidden":
      return "You do not have access to export this report.";
    case "validation":
      return "The export request is invalid. Check the date range and report options.";
    case "network":
      return "The export could not reach the Commerce API. Check your connection and try again.";
    case "contract":
      return "The export response could not be validated.";
    case "server":
      return "The Commerce API could not create this export. Try again.";
    case "not-found":
    case "unknown":
    default:
      return "The export could not be saved or shared. Try again.";
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

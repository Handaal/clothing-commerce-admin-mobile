import { Redirect, useRouter } from "expo-router";

import { resolveReportingAdapter } from "../../src/reporting/adapter";
import { reportingCapabilities } from "../../src/reporting/capabilities";
import { ReportsDashboardScreen } from "../../src/reporting/ReportsDashboardScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function ReportsRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  const capabilities = reportingCapabilities(state.context);
  const adapter = resolveReportingAdapter(getTenantClient(state.tenantId));
  return (
    <ReportsDashboardScreen
      adapter={adapter}
      canRead={capabilities.canRead}
      onOpen={(report) => router.push(`/reports/${report}`)}
      onBack={() => router.back()}
    />
  );
}

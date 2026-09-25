import { Redirect, useRouter } from "expo-router";
import { resolveReportingAdapter } from "../../src/reporting/adapter";
import { reportingCapabilities } from "../../src/reporting/capabilities";
import { SuppliersReportScreen } from "../../src/reporting/ReportDomainScreens";
import { useSession } from "../../src/session/SessionProvider";

export default function SuppliersReportRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <SuppliersReportScreen
      adapter={resolveReportingAdapter(getTenantClient(state.tenantId))}
      canRead={reportingCapabilities(state.context).canRead}
      onBack={() => router.back()}
    />
  );
}

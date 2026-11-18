import { Redirect } from "expo-router";

import { useSession } from "../src/session/SessionProvider";
import { SyncConflictsScreen } from "../src/sync-conflicts/SyncConflictsScreen";

// ADR-042 §13.5 — read-only POS sync conflict report (tenant-wide orders.read).
export default function SyncConflictsRoute() {
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return <SyncConflictsScreen client={getTenantClient(state.tenantId)} context={state.context} />;
}

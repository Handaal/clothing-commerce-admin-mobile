import { Redirect, useRouter } from "expo-router";

import { useSession } from "../../src/session/SessionProvider";
import { resolveStaffAdapter } from "../../src/staff/adapter";
import { staffCapabilities } from "../../src/staff/capabilities";
import { StaffListScreen } from "../../src/staff/StaffListScreen";

// Route wrapper: keeps navigation concerns out of the screen (which stays router-agnostic and directly
// unit-testable). Staff is only reachable from a fully resolved session. The adapter is SDK-backed; the
// Add-Staff affordance follows the server's staff management capability, and the API stays authoritative
// for every read and write.
export default function StaffRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  const adapter = resolveStaffAdapter(getTenantClient(state.tenantId));
  const { canManage } = staffCapabilities(state.context);

  return (
    <StaffListScreen
      adapter={adapter}
      canManage={canManage}
      onOpenStaff={(membershipId) => router.push(`/staff/${membershipId}`)}
      onAddStaff={() => router.push("/staff/new")}
      onBack={() => router.back()}
    />
  );
}

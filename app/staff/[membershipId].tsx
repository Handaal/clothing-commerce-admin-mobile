import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { useSession } from "../../src/session/SessionProvider";
import { resolveStaffAdapter } from "../../src/staff/adapter";
import { staffCapabilities } from "../../src/staff/capabilities";
import { StaffDetailScreen } from "../../src/staff/StaffDetailScreen";

export default function StaffDetailRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  const adapter = resolveStaffAdapter(getTenantClient(state.tenantId));
  const { canManage } = staffCapabilities(state.context);

  return (
    <StaffDetailScreen
      adapter={adapter}
      membershipId={membershipId}
      canManage={canManage}
      onBack={() => router.back()}
    />
  );
}

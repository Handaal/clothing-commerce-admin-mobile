import { Redirect, useRouter } from "expo-router";

import { useSession } from "../../src/session/SessionProvider";
import { staffCapabilities } from "../../src/staff/capabilities";
import { PosAccountsScreen } from "../../src/staff/PosAccountsScreen";

// ADR-043: the owner's Clerk-free bootstrap path for POS-native accounts (first POS admin). The API stays
// authoritative for every read and write; the screen only offers the affordance when the server says the caller
// may manage staff.
export default function PosAccountsRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  const { canManage } = staffCapabilities(state.context);
  return (
    <PosAccountsScreen
      client={getTenantClient(state.tenantId)}
      canManage={canManage}
      onBack={() => router.back()}
    />
  );
}

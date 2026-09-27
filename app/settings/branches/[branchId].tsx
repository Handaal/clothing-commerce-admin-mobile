import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../../../src/session/SessionProvider";
import { BranchFormScreen } from "../../../src/settings/SettingsScreens";
import { settingsRouteState } from "../../../src/settings/route";
export default function Route() {
  const router = useRouter();
  const { branchId } = useLocalSearchParams<{ branchId: string }>();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <BranchFormScreen
      {...settingsRouteState(state.context, getTenantClient(state.tenantId))}
      branchId={branchId}
      onBack={() => router.back()}
    />
  );
}

import { Redirect, useRouter } from "expo-router";
import { useSession } from "../../src/session/SessionProvider";
import { CommerceSettingsScreen } from "../../src/settings/SettingsScreens";
import { settingsRouteState } from "../../src/settings/route";
export default function Route() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <CommerceSettingsScreen
      {...settingsRouteState(state.context, getTenantClient(state.tenantId))}
      onBack={() => router.back()}
    />
  );
}

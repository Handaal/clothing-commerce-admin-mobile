import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../../../src/session/SessionProvider";
import { DeviceDetailScreen } from "../../../src/settings/SettingsScreens";
import { settingsRouteState } from "../../../src/settings/route";
export default function Route() {
  const router = useRouter();
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <DeviceDetailScreen
      {...settingsRouteState(state.context, getTenantClient(state.tenantId))}
      id={deviceId}
      onBack={() => router.back()}
    />
  );
}

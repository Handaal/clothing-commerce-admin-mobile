import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../../../src/session/SessionProvider";
import { InventoryLocationDetailScreen } from "../../../src/settings/SettingsScreens";
import { settingsRouteState } from "../../../src/settings/route";
export default function Route() {
  const router = useRouter();
  const { locationId } = useLocalSearchParams<{ locationId: string }>();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <InventoryLocationDetailScreen
      {...settingsRouteState(state.context, getTenantClient(state.tenantId))}
      id={locationId}
      onBack={() => router.back()}
    />
  );
}

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../../../src/session/SessionProvider";
import { WarehouseDetailScreen } from "../../../src/settings/SettingsScreens";
import { settingsRouteState } from "../../../src/settings/route";
export default function Route() {
  const router = useRouter();
  const { warehouseId } = useLocalSearchParams<{ warehouseId: string }>();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <WarehouseDetailScreen
      {...settingsRouteState(state.context, getTenantClient(state.tenantId))}
      id={warehouseId}
      onBack={() => router.back()}
    />
  );
}

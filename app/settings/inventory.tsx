import { Redirect, useRouter } from "expo-router";
import { useSession } from "../../src/session/SessionProvider";
import { InventorySettingsScreen } from "../../src/settings/SettingsScreens";
import { settingsRouteState } from "../../src/settings/route";
export default function Route() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <InventorySettingsScreen
      {...settingsRouteState(state.context, getTenantClient(state.tenantId))}
      onOpenWarehouse={(id) => router.push(`/settings/warehouses/${id}`)}
      onOpenLocation={(id) => router.push(`/settings/inventory-locations/${id}`)}
      onCreateWarehouse={() => router.push("/settings/warehouses/new")}
      onCreateLocation={() => router.push("/settings/inventory-locations/new")}
      onBack={() => router.back()}
    />
  );
}

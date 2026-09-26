import { Redirect, useRouter } from "expo-router";
import { useSession } from "../../../src/session/SessionProvider";
import { RegistersSettingsScreen } from "../../../src/settings/SettingsScreens";
import { settingsRouteState } from "../../../src/settings/route";
export default function Route() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <RegistersSettingsScreen
      {...settingsRouteState(state.context, getTenantClient(state.tenantId))}
      onOpen={(id) => router.push(`/settings/registers/${id}`)}
      onCreate={() => router.push("/settings/registers/new")}
      onDevices={() => router.push("/settings/devices")}
      onBack={() => router.back()}
    />
  );
}

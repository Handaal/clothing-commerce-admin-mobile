import { Redirect, useRouter } from "expo-router";
import { useSession } from "../../../src/session/SessionProvider";
import { BrandsSettingsScreen } from "../../../src/settings/SettingsScreens";
import { settingsRouteState } from "../../../src/settings/route";
export default function Route() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <BrandsSettingsScreen
      {...settingsRouteState(state.context, getTenantClient(state.tenantId))}
      onOpen={(id) => router.push(`/settings/brands/${id}`)}
      onCreate={() => router.push("/settings/brands/new")}
      onBack={() => router.back()}
    />
  );
}

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../../../src/session/SessionProvider";
import { RegisterFormScreen } from "../../../src/settings/SettingsScreens";
import { settingsRouteState } from "../../../src/settings/route";
export default function Route() {
  const router = useRouter();
  const { registerId } = useLocalSearchParams<{ registerId: string }>();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <RegisterFormScreen
      {...settingsRouteState(state.context, getTenantClient(state.tenantId))}
      registerId={registerId}
      onBack={() => router.back()}
    />
  );
}

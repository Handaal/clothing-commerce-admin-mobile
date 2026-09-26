import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../../../src/session/SessionProvider";
import { BrandFormScreen } from "../../../src/settings/SettingsScreens";
import { settingsRouteState } from "../../../src/settings/route";
export default function Route() {
  const router = useRouter();
  const { brandId } = useLocalSearchParams<{ brandId: string }>();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <BrandFormScreen
      {...settingsRouteState(state.context, getTenantClient(state.tenantId))}
      brandId={brandId}
      onBack={() => router.back()}
    />
  );
}

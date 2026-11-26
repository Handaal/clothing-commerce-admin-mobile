import { Redirect, useRouter } from "expo-router";

import { useSession } from "../src/session/SessionProvider";
import { StorefrontContentScreen } from "../src/storefront/StorefrontContentScreen";

// Home-page editor (hero + featured picks). The API authorizes catalog.author; catalog read access is
// the closest navigation hint the context exposes, so a 403 from the API still renders cleanly.
export default function StorefrontContentRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <StorefrontContentScreen
      client={getTenantClient(state.tenantId)}
      canManage={state.context.access.catalog.canRead}
      onBack={() => router.back()}
    />
  );
}

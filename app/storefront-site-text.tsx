import { Redirect, useRouter } from "expo-router";

import { useSession } from "../src/session/SessionProvider";
import { SiteTextScreen } from "../src/storefront/SiteTextScreen";

// Site text editor (promo bar, section titles, footer, contact, FAQ / Terms / Shipping pages). The API
// authorizes catalog.author; catalog read access is the closest navigation hint the context exposes.
export default function StorefrontSiteTextRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <SiteTextScreen
      client={getTenantClient(state.tenantId)}
      canManage={state.context.access.catalog.canRead}
      onBack={() => router.back()}
    />
  );
}

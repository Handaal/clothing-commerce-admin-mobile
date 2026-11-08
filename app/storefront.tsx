import { Redirect, useRouter } from "expo-router";

import { StorefrontScreen } from "../src/storefront/StorefrontScreen";
import { useSession } from "../src/session/SessionProvider";

// Route wrapper: keeps navigation out of the screen component (which stays router-agnostic and
// directly unit-testable). The storefront hub is only reachable from a fully resolved session.
export default function StorefrontRoute() {
  const router = useRouter();
  const { state } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;

  return (
    <StorefrontScreen
      tenantId={state.tenantId}
      context={state.context}
      onManageCheckout={() => router.push("/settings/commerce")}
      onOpenProducts={() => router.push("/products")}
      onOpenPromotions={() => router.push("/promotions")}
      onBack={() => router.back()}
    />
  );
}

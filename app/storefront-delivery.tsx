import { Redirect, useRouter } from "expo-router";

import { useSession } from "../src/session/SessionProvider";
import { DeliveryFeesScreen } from "../src/storefront/DeliveryFeesScreen";

// Route wrapper: website delivery fees, reachable only from a fully resolved session.
export default function StorefrontDeliveryRoute() {
  const router = useRouter();
  const { state } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <DeliveryFeesScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => router.back()}
    />
  );
}

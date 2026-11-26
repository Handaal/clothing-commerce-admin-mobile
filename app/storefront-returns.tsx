import { Redirect, useRouter } from "expo-router";

import { useSession } from "../src/session/SessionProvider";
import { ReturnRequestsScreen } from "../src/storefront/ReturnRequestsScreen";

// Route wrapper: customer return requests from the website, reachable only from a resolved session.
export default function StorefrontReturnsRoute() {
  const router = useRouter();
  const { state } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <ReturnRequestsScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => router.back()}
      onOpenOrder={(orderId) => router.push(`/orders/${orderId}`)}
    />
  );
}

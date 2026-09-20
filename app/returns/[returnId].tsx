import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { ReturnDetailScreen } from "../../src/returns/ReturnDetailScreen";
import { useSession } from "../../src/session/SessionProvider";

// Route wrapper: keeps navigation out of the screen component (which stays router-agnostic and
// directly unit-testable). Returns are only reachable from a fully resolved session, via an order.
export default function ReturnDetailRoute() {
  const router = useRouter();
  const { returnId } = useLocalSearchParams<{ returnId: string }>();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }
  if (!returnId) {
    return <Redirect href="/orders" />;
  }

  return (
    <ReturnDetailScreen
      tenantId={state.tenantId}
      returnId={returnId}
      onBack={() => router.back()}
      onOpenOrder={(orderId) => router.push(`/orders/${orderId}`)}
    />
  );
}

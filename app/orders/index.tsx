import { Redirect, useRouter } from "expo-router";

import { OrdersListScreen } from "../../src/orders/OrdersListScreen";
import { useSession } from "../../src/session/SessionProvider";

// Route wrapper: keeps navigation concerns out of the screen component (which stays router-agnostic
// and directly unit-testable). Orders are only reachable from a fully resolved session.
export default function OrdersRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <OrdersListScreen
      tenantId={state.tenantId}
      context={state.context}
      onOpenOrder={(orderId) => router.push(`/orders/${orderId}`)}
      onBack={() => router.back()}
    />
  );
}

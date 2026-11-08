import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { OrderDetailScreen } from "../../src/orders/OrderDetailScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function OrderDetailRoute() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }
  if (!orderId) {
    return <Redirect href="/orders" />;
  }

  return (
    <OrderDetailScreen
      tenantId={state.tenantId}
      orderId={orderId}
      onBack={() => router.back()}
      onOpenReturn={(returnId) => router.push(`/returns/${returnId}`)}
      onCreateReturn={(id) => router.push(`/returns/new?orderId=${id}`)}
    />
  );
}

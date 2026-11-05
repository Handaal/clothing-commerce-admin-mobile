import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { CustomerDetailScreen } from "../../src/customers/CustomerDetailScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function CustomerDetailRoute() {
  const router = useRouter();
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }
  if (!customerId) {
    return <Redirect href="/customers" />;
  }

  return (
    <CustomerDetailScreen
      tenantId={state.tenantId}
      customerId={customerId}
      onBack={() => router.back()}
      onOpenOrder={(orderId) => router.push(`/orders/${orderId}`)}
    />
  );
}

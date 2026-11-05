import { Redirect, useRouter } from "expo-router";

import { CustomersListScreen } from "../../src/customers/CustomersListScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function CustomersRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <CustomersListScreen
      tenantId={state.tenantId}
      onOpenCustomer={(customerId) => router.push(`/customers/${customerId}`)}
      onBack={() => router.back()}
    />
  );
}

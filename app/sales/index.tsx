import { Redirect, useRouter } from "expo-router";

import { promotionCapabilities } from "../../src/promotions/capabilities";
import { SalesListScreen } from "../../src/sales/SalesListScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function SalesRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  const capabilities = promotionCapabilities(state.context);
  return (
    <SalesListScreen
      client={getTenantClient(state.tenantId)}
      canRead={capabilities.canRead}
      canManage={capabilities.canManage}
      onOpenSale={(saleId) => router.push(`/sales/${saleId}`)}
      onCreateSale={() => router.push("/sales/new")}
      onBack={() => router.back()}
    />
  );
}

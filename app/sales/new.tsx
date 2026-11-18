import { Redirect, useRouter } from "expo-router";

import { promotionCapabilities } from "../../src/promotions/capabilities";
import { SaleFormScreen } from "../../src/sales/SaleFormScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function CreateSaleRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <SaleFormScreen
      mode="create"
      client={getTenantClient(state.tenantId)}
      canManage={promotionCapabilities(state.context).canManage}
      onDone={() => router.replace("/sales")}
      onBack={() => router.back()}
    />
  );
}

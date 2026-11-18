import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { promotionCapabilities } from "../../src/promotions/capabilities";
import { SaleFormScreen } from "../../src/sales/SaleFormScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function EditSaleRoute() {
  const router = useRouter();
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <SaleFormScreen
      key={saleId}
      mode="edit"
      saleId={saleId}
      client={getTenantClient(state.tenantId)}
      canManage={promotionCapabilities(state.context).canManage}
      onDone={() => router.replace("/sales")}
      onBack={() => router.back()}
    />
  );
}

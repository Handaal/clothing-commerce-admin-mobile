import { Redirect, useRouter } from "expo-router";

import { promotionCapabilities } from "../../src/promotions/capabilities";
import { PromotionsListScreen } from "../../src/promotions/PromotionsListScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function PromotionsRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;

  const capabilities = promotionCapabilities(state.context);
  return (
    <PromotionsListScreen
      client={getTenantClient(state.tenantId)}
      canRead={capabilities.canRead}
      canManage={capabilities.canManage}
      onOpenPromotion={(promotionId) => router.push(`/promotions/${promotionId}`)}
      onCreatePromotion={() => router.push("/promotions/new")}
      onBack={() => router.back()}
    />
  );
}

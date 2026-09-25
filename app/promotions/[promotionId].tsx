import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { promotionCapabilities } from "../../src/promotions/capabilities";
import { PromotionDetailScreen } from "../../src/promotions/PromotionDetailScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function PromotionDetailRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  const { promotionId } = useLocalSearchParams<{ promotionId: string }>();
  if (state.phase !== "ready") return <Redirect href="/" />;

  const capabilities = promotionCapabilities(state.context);
  return (
    <PromotionDetailScreen
      client={getTenantClient(state.tenantId)}
      context={state.context}
      promotionId={promotionId}
      canRead={capabilities.canRead}
      canManage={capabilities.canManage}
      onEdit={(id) => router.push(`/promotions/edit/${id}`)}
      onBack={() => router.back()}
    />
  );
}

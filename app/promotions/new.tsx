import { Redirect, useRouter } from "expo-router";

import { promotionCapabilities } from "../../src/promotions/capabilities";
import { PromotionFormScreen } from "../../src/promotions/PromotionFormScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function CreatePromotionRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;

  const capabilities = promotionCapabilities(state.context);
  return (
    <PromotionFormScreen
      mode="create"
      client={getTenantClient(state.tenantId)}
      context={state.context}
      canManage={capabilities.canManage}
      onSaved={(promotion) => router.replace(`/promotions/${promotion.id}`)}
      onBack={() => router.back()}
    />
  );
}

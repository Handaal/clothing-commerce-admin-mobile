import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { promotionCapabilities } from "../../../src/promotions/capabilities";
import { PromotionFormScreen } from "../../../src/promotions/PromotionFormScreen";
import { useSession } from "../../../src/session/SessionProvider";

export default function EditPromotionRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  const { promotionId } = useLocalSearchParams<{ promotionId: string }>();
  if (state.phase !== "ready") return <Redirect href="/" />;

  const capabilities = promotionCapabilities(state.context);
  return (
    <PromotionFormScreen
      mode="edit"
      client={getTenantClient(state.tenantId)}
      context={state.context}
      canManage={capabilities.canManage}
      promotionId={promotionId}
      onSaved={() => router.replace(`/promotions/${promotionId}`)}
      onBack={() => router.back()}
    />
  );
}

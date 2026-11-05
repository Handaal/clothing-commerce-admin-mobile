import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { CreateReturnScreen } from "../../src/returns/CreateReturnScreen";
import { useSession } from "../../src/session/SessionProvider";

// Route wrapper for the create-return flow. A static `new` segment takes priority over the sibling
// `[returnId]` dynamic route, so `/returns/new?orderId=…` always resolves here. Returns are only
// creatable from a fully resolved session, against a known order.
export default function CreateReturnRoute() {
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
    <CreateReturnScreen
      tenantId={state.tenantId}
      orderId={orderId}
      context={state.context}
      onCreated={(returnId) => router.replace(`/returns/${returnId}`)}
      onBack={() => router.back()}
    />
  );
}

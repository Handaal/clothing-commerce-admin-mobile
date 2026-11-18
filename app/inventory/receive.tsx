import { Redirect, useRouter } from "expo-router";

import { ReceiveNewStockScreen } from "../../src/inventory/ReceiveNewStockScreen";
import { goBackOrReplace } from "../../src/navigation/back";
import { useSession } from "../../src/session/SessionProvider";

// Receive new stock: the POS "Add product" flow. Reached from the Stock page, Home quick actions and
// the Products tab's "New product" button.
export default function ReceiveNewStockRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") return <Redirect href="/" />;

  return (
    <ReceiveNewStockScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => goBackOrReplace(router, "/inventory")}
      onDone={() => router.replace("/inventory")}
    />
  );
}

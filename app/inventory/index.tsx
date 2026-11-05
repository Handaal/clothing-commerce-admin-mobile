import { Redirect, useRouter } from "expo-router";

import { InventoryScreen } from "../../src/inventory/InventoryScreen";
import { goBackOrReplace } from "../../src/navigation/back";
import { useSession } from "../../src/session/SessionProvider";

// Route wrapper: keeps navigation concerns out of the screen component (which stays router-agnostic
// and directly unit-testable). Inventory is only reachable from a fully resolved session.
export default function InventoryRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <InventoryScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => goBackOrReplace(router, "/")}
    />
  );
}

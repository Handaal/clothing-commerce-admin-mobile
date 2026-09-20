import { Redirect, useRouter } from "expo-router";

import { useSession } from "../../src/session/SessionProvider";
import { resolveSupplierAdapter } from "../../src/suppliers/adapter";
import { SuppliersListScreen } from "../../src/suppliers/SuppliersListScreen";

// Route wrapper: keeps navigation concerns out of the screen (which stays router-agnostic and directly
// unit-testable). Suppliers are only reachable from a fully resolved session. The Supplier adapter is
// null until the Supplier API/SDK exists, so the screen renders an explicit unavailable state today.
export default function SuppliersRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  const adapter = resolveSupplierAdapter(getTenantClient(state.tenantId));

  return (
    <SuppliersListScreen
      adapter={adapter}
      onOpenSupplier={(supplierId) => router.push(`/suppliers/${supplierId}`)}
      onCreateSupplier={() => router.push("/suppliers/new")}
      onBack={() => router.back()}
    />
  );
}

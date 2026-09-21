import { Redirect, useRouter } from "expo-router";

import { useSession } from "../../src/session/SessionProvider";
import { resolveSupplierAdapter } from "../../src/suppliers/adapter";
import { supplierCapabilities } from "../../src/suppliers/capabilities";
import { SuppliersListScreen } from "../../src/suppliers/SuppliersListScreen";

// Route wrapper: keeps navigation concerns out of the screen (which stays router-agnostic and directly
// unit-testable). Suppliers are only reachable from a fully resolved session. The adapter is SDK-backed
// and the create affordance follows the server's supplier management capability; the API stays
// authoritative for every read and write.
export default function SuppliersRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  const adapter = resolveSupplierAdapter(getTenantClient(state.tenantId));
  const { canManage } = supplierCapabilities(state.context);

  return (
    <SuppliersListScreen
      adapter={adapter}
      canManage={canManage}
      onOpenSupplier={(supplierId) => router.push(`/suppliers/${supplierId}`)}
      onCreateSupplier={() => router.push("/suppliers/new")}
      onBack={() => router.back()}
    />
  );
}

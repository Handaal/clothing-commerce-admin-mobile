import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { useSession } from "../../src/session/SessionProvider";
import { resolveSupplierAdapter } from "../../src/suppliers/adapter";
import { supplierCapabilities } from "../../src/suppliers/capabilities";
import { SupplierDetailScreen } from "../../src/suppliers/SupplierDetailScreen";

export default function SupplierDetailRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  const { supplierId } = useLocalSearchParams<{ supplierId: string }>();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  const client = getTenantClient(state.tenantId);
  const adapter = resolveSupplierAdapter(client);
  const { canManage } = supplierCapabilities(state.context);

  return (
    <SupplierDetailScreen
      adapter={adapter}
      supplierId={supplierId}
      canManage={canManage}
      context={state.context}
      client={client}
      onEdit={(id) => router.push(`/suppliers/edit/${id}`)}
      onBack={() => router.back()}
    />
  );
}

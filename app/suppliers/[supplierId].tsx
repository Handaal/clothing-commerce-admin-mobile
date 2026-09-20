import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { useSession } from "../../src/session/SessionProvider";
import { resolveSupplierAdapter } from "../../src/suppliers/adapter";
import { SupplierDetailScreen } from "../../src/suppliers/SupplierDetailScreen";

export default function SupplierDetailRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  const { supplierId } = useLocalSearchParams<{ supplierId: string }>();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  const adapter = resolveSupplierAdapter(getTenantClient(state.tenantId));

  return (
    <SupplierDetailScreen
      adapter={adapter}
      supplierId={supplierId}
      onEdit={(id) => router.push(`/suppliers/edit/${id}`)}
      onBack={() => router.back()}
    />
  );
}

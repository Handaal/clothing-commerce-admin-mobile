import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { useSession } from "../../../src/session/SessionProvider";
import { resolveSupplierAdapter } from "../../../src/suppliers/adapter";
import { SupplierFormScreen } from "../../../src/suppliers/SupplierFormScreen";

export default function EditSupplierRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();
  const { supplierId } = useLocalSearchParams<{ supplierId: string }>();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  const adapter = resolveSupplierAdapter(getTenantClient(state.tenantId));

  return (
    <SupplierFormScreen
      mode="edit"
      adapter={adapter}
      supplierId={supplierId}
      onSaved={() => router.replace(`/suppliers/${supplierId}`)}
      onBack={() => router.back()}
    />
  );
}

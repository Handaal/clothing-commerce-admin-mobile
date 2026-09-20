import { Redirect, useRouter } from "expo-router";

import { useSession } from "../../src/session/SessionProvider";
import { resolveSupplierAdapter } from "../../src/suppliers/adapter";
import { SupplierFormScreen } from "../../src/suppliers/SupplierFormScreen";

export default function CreateSupplierRoute() {
  const router = useRouter();
  const { state, getTenantClient } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  const adapter = resolveSupplierAdapter(getTenantClient(state.tenantId));

  return (
    <SupplierFormScreen
      mode="create"
      adapter={adapter}
      onSaved={(supplier) => router.replace(`/suppliers/${supplier.id}`)}
      onBack={() => router.back()}
    />
  );
}

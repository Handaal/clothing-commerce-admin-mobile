import { Redirect, useRouter } from "expo-router";

import { ProductsListScreen } from "../../src/products/ProductsListScreen";
import { useSession } from "../../src/session/SessionProvider";

// Route wrapper: keeps navigation concerns out of the screen component (which stays router-agnostic
// and directly unit-testable). Products are only reachable from a fully resolved session.
export default function ProductsRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <ProductsListScreen
      tenantId={state.tenantId}
      context={state.context}
      onOpenProduct={(productId) => router.push(`/products/${productId}`)}
      onCreateProduct={() => router.push("/products/new")}
      onBack={() => router.back()}
    />
  );
}

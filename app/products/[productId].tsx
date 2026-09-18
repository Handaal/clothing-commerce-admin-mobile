import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { ProductManageScreen } from "../../src/products/ProductManageScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function ProductManageRoute() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }
  if (!productId) {
    return <Redirect href="/products" />;
  }

  return (
    <ProductManageScreen
      tenantId={state.tenantId}
      productId={productId}
      onBack={() => router.back()}
    />
  );
}

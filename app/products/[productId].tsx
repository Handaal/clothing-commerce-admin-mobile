import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { ProductDetailScreen } from "../../src/products/ProductDetailScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function ProductDetailRoute() {
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
    <ProductDetailScreen
      tenantId={state.tenantId}
      productId={productId}
      onBack={() => router.back()}
    />
  );
}

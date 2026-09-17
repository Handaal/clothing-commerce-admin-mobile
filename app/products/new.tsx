import { Redirect, useRouter } from "expo-router";

import { CreateProductScreen } from "../../src/products/CreateProductScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function CreateProductRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <CreateProductScreen
      tenantId={state.tenantId}
      context={state.context}
      onCreated={(productId) => router.replace(`/products/${productId}`)}
      onBack={() => router.back()}
    />
  );
}

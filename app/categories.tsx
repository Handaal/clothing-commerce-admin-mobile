import { Redirect, useRouter } from "expo-router";

import { CategoriesScreen } from "../src/categories/CategoriesScreen";
import { useSession } from "../src/session/SessionProvider";

// Route wrapper: categories are only reachable from a fully resolved session.
export default function CategoriesRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <CategoriesScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => router.back()}
    />
  );
}

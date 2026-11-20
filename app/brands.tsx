import { Redirect, useRouter } from "expo-router";

import { BrandsScreen } from "../src/brands/BrandsScreen";
import { useSession } from "../src/session/SessionProvider";

// Route wrapper: brands are only reachable from a fully resolved session.
export default function BrandsRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <BrandsScreen tenantId={state.tenantId} context={state.context} onBack={() => router.back()} />
  );
}

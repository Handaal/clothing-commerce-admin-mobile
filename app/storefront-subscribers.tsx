import { Redirect, useRouter } from "expo-router";

import { useSession } from "../src/session/SessionProvider";
import { SubscribersScreen } from "../src/storefront/SubscribersScreen";

// Route wrapper: website email sign-ups, reachable only from a fully resolved session.
export default function StorefrontSubscribersRoute() {
  const router = useRouter();
  const { state } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  return (
    <SubscribersScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => router.back()}
    />
  );
}

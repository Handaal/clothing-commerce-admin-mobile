import { Redirect, useRouter } from "expo-router";

import { CollectionsListScreen } from "../../src/collections/CollectionsListScreen";
import { useSession } from "../../src/session/SessionProvider";

// Route wrapper: keeps navigation concerns out of the screen component (which stays router-agnostic and
// directly unit-testable). Collections are only reachable from a fully resolved session.
export default function CollectionsRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <CollectionsListScreen
      tenantId={state.tenantId}
      context={state.context}
      onOpenCollection={(collectionId) => router.push(`/collections/${collectionId}`)}
      onCreateCollection={() => router.push("/collections/new")}
      onBack={() => router.back()}
    />
  );
}

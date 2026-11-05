import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { CollectionManageScreen } from "../../src/collections/CollectionManageScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function CollectionManageRoute() {
  const router = useRouter();
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }
  if (!collectionId) {
    return <Redirect href="/collections" />;
  }

  return (
    <CollectionManageScreen
      tenantId={state.tenantId}
      collectionId={collectionId}
      onBack={() => router.back()}
    />
  );
}

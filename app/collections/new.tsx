import { Redirect, useRouter } from "expo-router";

import { CreateCollectionScreen } from "../../src/collections/CreateCollectionScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function CreateCollectionRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <CreateCollectionScreen
      tenantId={state.tenantId}
      context={state.context}
      onCreated={(collectionId) => router.replace(`/collections/${collectionId}`)}
      onBack={() => router.back()}
    />
  );
}

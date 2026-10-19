import { Redirect } from "expo-router";

import { useSession } from "../src/session/SessionProvider";
import { Body, EmptyState, PageHeader, ScrollScreen } from "../src/ui/components";

/** Reserved top-level section. Website-management functionality is intentionally not invented here. */
export default function StorefrontRoute() {
  const { state } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Website" title="Storefront" />
      <Body>A dedicated place for managing the customer-facing website.</Body>
      <EmptyState
        icon="storefront-outline"
        badge="Reserved"
        title="Storefront workspace"
        message="Website management will be added here in a future phase. No checkout or visual page editor is included."
      />
    </ScrollScreen>
  );
}

import { Redirect } from "expo-router";

// ADR-042 §13 (owner decision 2026-11-14 night): Website/POS stock splitting is not part of the product —
// stock is one shared pool. The former split screen (src/inventory/ChannelSplitScreen.tsx, dormant) is no
// longer reachable; an old deep link lands on Stock instead.
export default function RetiredChannelSplitRoute() {
  return <Redirect href="/inventory" />;
}

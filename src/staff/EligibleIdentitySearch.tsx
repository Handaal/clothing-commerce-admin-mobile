import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  InfoRow,
  LoadingBlock,
  PressableRow,
  PrimaryButton,
  TextField,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { StaffAdapter } from "./adapter";
import { loadAllEligibleIdentities } from "./load";
import type { EligibleIdentity } from "./model";
import {
  buildEligibleIdentityQuery,
  EMPTY_ELIGIBLE_IDENTITY_SEARCH,
  type EligibleIdentityQuery,
  type EligibleIdentitySearchState,
} from "./search";

export interface EligibleIdentitySearchProps {
  adapter: StaffAdapter;
  selectedIdentityId: string | null;
  onSelect: (identity: EligibleIdentity) => void;
}

/**
 * Step 1 of Add-Staff: search for and select an EXISTING provisioned identity to link to the tenant.
 *
 * Add-Staff links an existing identity — there is no Clerk invitation, no email, no password, and NO
 * raw-UUID entry as the normal UX. Discovery is a deliberate search that round-trips to the server via
 * the adapter (the identity-discovery contract is still being finalized, so the app never guesses the
 * endpoint or DTO). Until a term is entered the app does not bulk-list every identity.
 */
export function EligibleIdentitySearch({
  adapter,
  selectedIdentityId,
  onSelect,
}: EligibleIdentitySearchProps) {
  const [search, setSearch] = useState<EligibleIdentitySearchState>(EMPTY_ELIGIBLE_IDENTITY_SEARCH);
  // The committed query the loader runs. `null` means "nothing searched yet" — we show a prompt, not a
  // dump of every identity. Committing on an explicit action keeps this a server round-trip.
  const [query, setQuery] = useState<EligibleIdentityQuery | null>(null);

  function applySearch() {
    setQuery(buildEligibleIdentityQuery(search));
  }

  return (
    <View style={{ gap: 12 }}>
      <TextField
        label="Find a person"
        value={search.term}
        onChangeText={(term) => setSearch({ term })}
        placeholder="Search by name or email"
        testID="eligible-identity-term"
        autoCapitalize="none"
      />
      <PrimaryButton
        label="Search people"
        testID="eligible-identity-search"
        onPress={applySearch}
      />
      {query === null ? (
        <Body testID="eligible-identity-prompt">
          Search for an existing person to add as staff. Only people who already have a platform
          account can be linked — no invitations are sent from here.
        </Body>
      ) : (
        <EligibleIdentityResults
          adapter={adapter}
          query={query}
          selectedIdentityId={selectedIdentityId}
          onSelect={onSelect}
        />
      )}
    </View>
  );
}

function EligibleIdentityResults({
  adapter,
  query,
  selectedIdentityId,
  onSelect,
}: {
  adapter: StaffAdapter;
  query: EligibleIdentityQuery;
  selectedIdentityId: string | null;
  onSelect: (identity: EligibleIdentity) => void;
}) {
  const load = useCallback(() => loadAllEligibleIdentities(adapter, query), [adapter, query]);
  const { state, reload } = useAsync<EligibleIdentity[]>(load);
  const results = useMemo(() => (state.status === "success" ? state.data : []), [state]);

  if (state.status === "loading") return <LoadingBlock label="Searching people…" />;

  if (state.status === "error") {
    return (
      <View style={{ gap: 8 }}>
        <Title>{errorHeading(state.error.kind)}</Title>
        <Body>{state.error.message}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label="Try again" onPress={reload} />
        ) : null}
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <Body testID="eligible-identity-empty">
        No matching people found. Try a different name or email.
      </Body>
    );
  }

  return (
    <View style={{ gap: 12 }} testID="eligible-identity-results">
      {results.map((identity) => (
        <PressableRow
          key={identity.identityId}
          testID={`eligible-identity-${identity.identityId}`}
          onPress={() => onSelect(identity)}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Title>{identity.displayName}</Title>
            {identity.identityId === selectedIdentityId ? (
              <Badge
                label="Selected"
                testID={`eligible-identity-selected-${identity.identityId}`}
              />
            ) : null}
          </View>
          {identity.email ? <InfoRow label="Email" value={identity.email} /> : null}
          <InfoRow label="Status" value={identity.identityStatus} />
        </PressableRow>
      ))}
    </View>
  );
}

import { useCallback, useState } from "react";
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
import type { EligibleIdentity } from "./model";
import { buildEligibleEmailLookup } from "./search";

export interface EligibleIdentityLookupProps {
  adapter: StaffAdapter;
  selectedIdentityId: string | null;
  onSelect: (identity: EligibleIdentity) => void;
}

/** One neutral, non-enumerating result for every "not eligible" case (see {@link StaffAdapter}). */
const NO_RESULT_MESSAGE = "No eligible account was found for this email.";

/**
 * Step 1 of Add-Staff: resolve EXISTING account(s) by an EXACT email, then confirm/select one.
 *
 * Add-Staff links an existing identity — there is no Clerk invitation, no email send, no password. Per
 * the frozen V1 privacy decision, discovery is an EXACT-EMAIL lookup: the operator types an email, taps
 * "Find account", and the eligible account(s) for that EXACT email appear (or one neutral no-result
 * message shows). Because a platform `primary_email` is NOT globally unique the lookup returns 0..N
 * matches; when it returns two or more, the manager must EXPLICITLY pick which identity to link — the UI
 * never auto-selects the first result. There is deliberately NO directory browse, NO display-name
 * search, NO wildcard, and NO raw-UUID entry — the screen can never enumerate who exists on the
 * platform. The email is validated (and trimmed/lowercased for convenience) before the adapter is ever
 * called.
 */
export function EligibleIdentityLookup({
  adapter,
  selectedIdentityId,
  onSelect,
}: EligibleIdentityLookupProps) {
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  // The committed, validated+normalized email the lookup runs against. `null` means "nothing looked up
  // yet" — we show a prompt, never a directory dump. Committing on an explicit action keeps this a
  // deliberate server round-trip for a single exact email (which may resolve to 0..N accounts).
  const [email, setEmail] = useState<string | null>(null);

  function findAccount() {
    const normalized = buildEligibleEmailLookup(input);
    if (normalized === null) {
      setInvalid(true);
      setEmail(null);
      return;
    }
    setInvalid(false);
    setEmail(normalized);
  }

  return (
    <View style={{ gap: 12 }}>
      <TextField
        label="Account email"
        value={input}
        onChangeText={(value) => {
          setInput(value);
          if (invalid) setInvalid(false);
        }}
        placeholder="name@business.example"
        testID="eligible-identity-email"
        autoCapitalize="none"
      />
      <PrimaryButton label="Find account" testID="eligible-identity-find" onPress={findAccount} />
      {invalid ? (
        <Body testID="eligible-identity-invalid">Enter a valid email address.</Body>
      ) : email === null ? (
        <Body testID="eligible-identity-prompt">
          Enter the exact email of an existing platform account to add as staff. Only people who
          already have an account can be linked — no invitations are sent from here.
        </Body>
      ) : (
        <EligibleIdentityResult
          adapter={adapter}
          email={email}
          selectedIdentityId={selectedIdentityId}
          onSelect={onSelect}
        />
      )}
    </View>
  );
}

function EligibleIdentityResult({
  adapter,
  email,
  selectedIdentityId,
  onSelect,
}: {
  adapter: StaffAdapter;
  email: string;
  selectedIdentityId: string | null;
  onSelect: (identity: EligibleIdentity) => void;
}) {
  const load = useCallback(() => adapter.findEligibleIdentitiesByEmail(email), [adapter, email]);
  const { state, reload } = useAsync<EligibleIdentity[]>(load);

  if (state.status === "loading") return <LoadingBlock label="Finding account…" />;

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

  const identities = state.data;
  if (identities.length === 0) {
    // One neutral message for every not-eligible case — never distinguish "doesn't exist" from
    // "inactive" or "already a staff member", so the screen cannot be used to probe the directory.
    return <Body testID="eligible-identity-none">{NO_RESULT_MESSAGE}</Body>;
  }

  // 1 or N matches render identically: a row PER returned identity, NONE auto-selected. Because a
  // primary_email is not globally unique, several accounts can share this exact email; the manager must
  // TAP one to select it. Only fields safe in the foundation model are shown (display name, exact email,
  // identity status) — no tenant relationships, no invented identifiers. Every row is scoped to this one
  // exact email, so nothing here enumerates the wider directory.
  const multiple = identities.length > 1;
  return (
    <View style={{ gap: 12 }} testID="eligible-identity-result">
      {multiple ? (
        <Body testID="eligible-identity-multiple">
          More than one account uses this exact email. Choose the person you mean to add — nothing
          is selected automatically.
        </Body>
      ) : null}
      {identities.map((identity) => (
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

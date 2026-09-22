import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  type SelectOption,
  TextField,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { StaffAdapter } from "./adapter";
import { loadAllStaff } from "./load";
import type { RoleOption, StaffSummary } from "./model";
import {
  buildStaffListQuery,
  EMPTY_STAFF_SEARCH,
  isEmptyStaffSearch,
  type StaffListQuery,
  type StaffSearchState,
  type StaffStatusFilter,
} from "./search";
import { membershipStatusLabel, staffStatusFilterLabel } from "./status";
import { StaffUnavailable } from "./StaffUnavailable";

export interface StaffListScreenProps {
  /** The Staff integration seam. `null` renders an explicit unavailable state (production / safety net). */
  adapter: StaffAdapter | null;
  /** Server-derived: whether this caller may add/manage staff (UX affordance only). */
  canManage: boolean;
  /** Optional adapter-provided roles enabling a role filter. Omitted/empty hides the filter. */
  roleOptions?: RoleOption[];
  onOpenStaff: (membershipId: string) => void;
  onAddStaff: () => void;
  onBack: () => void;
}

const STATUS_FILTERS: StaffStatusFilter[] = ["all", "active", "suspended", "deactivated"];

/**
 * Staff list with server-side search. When no adapter is present (Staff SDK not integrated yet), it
 * shows an explicit unavailable state — it NEVER renders fabricated staff rows. With an adapter it
 * follows the same read discipline as the other lists: loading / error / empty / populated, with the
 * search / status / role constraints round-tripping to the server (no client-side filtering of a fake
 * dataset). In read-only mode (`canManage === false`) the Add-Staff affordance is not offered.
 */
export function StaffListScreen({
  adapter,
  canManage,
  roleOptions,
  onOpenStaff,
  onAddStaff,
  onBack,
}: StaffListScreenProps) {
  if (!adapter) {
    return (
      <ScrollScreen>
        <StaffUnavailable title="Staff" onBack={onBack} />
      </ScrollScreen>
    );
  }
  return (
    <StaffListContent
      adapter={adapter}
      canManage={canManage}
      roleOptions={roleOptions}
      onOpenStaff={onOpenStaff}
      onAddStaff={onAddStaff}
      onBack={onBack}
    />
  );
}

function StaffListContent({
  adapter,
  canManage,
  roleOptions,
  onOpenStaff,
  onAddStaff,
  onBack,
}: StaffListScreenProps & { adapter: StaffAdapter }) {
  // Draft search state the user edits, and the committed query the loader actually runs. Committing on
  // an explicit action (not each keystroke) keeps this a server round-trip, never a live local filter.
  const [search, setSearch] = useState<StaffSearchState>(EMPTY_STAFF_SEARCH);
  const [query, setQuery] = useState<StaffListQuery>(() => buildStaffListQuery(EMPTY_STAFF_SEARCH));
  const isFiltered = !isEmptyStaffSearch(search) || Object.keys(query).length > 0;

  const load = useCallback(() => loadAllStaff(adapter, query), [adapter, query]);
  const { state, reload } = useAsync<StaffSummary[]>(load);

  const statusOptions = useMemo<SelectOption[]>(
    () => STATUS_FILTERS.map((value) => ({ value, label: staffStatusFilterLabel(value) })),
    [],
  );
  const roleFilterOptions = useMemo<SelectOption[]>(
    () => [
      { value: "any", label: "Any role" },
      ...(roleOptions ?? []).map((role) => ({ value: role.id, label: role.label })),
    ],
    [roleOptions],
  );
  const showRoleFilter = (roleOptions?.length ?? 0) > 0;

  function applySearch() {
    setQuery(buildStaffListQuery(search));
  }

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Staff" title="Staff" onBack={onBack} />
      {/* Add-Staff is offered only when /me/context grants staff management. The API remains the sole
          authority and still authorizes the write — a real 403 surfaces on submit even if shown. */}
      {canManage ? (
        <PrimaryButton label="Add staff" testID="add-staff" onPress={onAddStaff} />
      ) : (
        <Body testID="staff-read-only-note">
          You have read-only access to staff. Managing staff requires additional permission.
        </Body>
      )}
      <Divider />

      <TextField
        label="Search"
        value={search.term}
        onChangeText={(term) => setSearch((prev) => ({ ...prev, term }))}
        placeholder="Name or email"
        testID="staff-search-term"
        autoCapitalize="none"
      />
      <SelectField
        label="Status"
        options={statusOptions}
        selected={search.status}
        onSelect={(value) => setSearch((prev) => ({ ...prev, status: value as StaffStatusFilter }))}
        testIDPrefix="staff-status-filter"
      />
      {showRoleFilter ? (
        <SelectField
          label="Role"
          options={roleFilterOptions}
          selected={search.roleId}
          onSelect={(value) => setSearch((prev) => ({ ...prev, roleId: value }))}
          testIDPrefix="staff-role-filter"
        />
      ) : null}
      <PrimaryButton label="Search staff" testID="staff-search-submit" onPress={applySearch} />
      <Divider />

      {state.status === "loading" ? <LoadingBlock label="Loading staff…" /> : null}
      {state.status === "error" ? (
        <>
          <Title>{errorHeading(state.error.kind)}</Title>
          <Body>{state.error.message}</Body>
          {isRetryable(state.error.kind) ? (
            <PrimaryButton label="Try again" onPress={reload} />
          ) : null}
        </>
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <Body testID="staff-empty">
          {isFiltered
            ? "No staff match your search."
            : "No staff yet. Add your first staff member to get started."}
        </Body>
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <View style={{ gap: 12 }}>
          {state.data.map((member) => (
            <StaffRow
              key={member.membershipId}
              member={member}
              onOpen={() => onOpenStaff(member.membershipId)}
            />
          ))}
        </View>
      ) : null}
    </ScrollScreen>
  );
}

function StaffRow({ member, onOpen }: { member: StaffSummary; onOpen: () => void }) {
  const roleSummary =
    member.roleSummaries.length > 0
      ? member.roleSummaries.map((role) => role.label).join(", ")
      : "No roles";
  const scopeSummary =
    member.scopeSummaries.length > 0
      ? member.scopeSummaries.map((scope) => scope.label).join(", ")
      : "No scopes";

  return (
    <PressableRow testID={`staff-row-${member.membershipId}`} onPress={onOpen}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Title>{member.displayName}</Title>
        <Badge
          label={membershipStatusLabel(member.status)}
          testID={`staff-status-${member.membershipId}`}
        />
      </View>
      {member.primaryEmail ? <InfoRow label="Email" value={member.primaryEmail} /> : null}
      <InfoRow label="Roles" value={roleSummary} />
      <InfoRow label="Scopes" value={scopeSummary} />
      {/* Deactivated staff stay listed — they are retained history, never hidden as if deleted. */}
      {member.status === "deactivated" ? (
        <Eyebrow>Deactivated — retained, not deleted</Eyebrow>
      ) : null}
    </PressableRow>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  TextButton,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import { AccessScopeSelector } from "./AccessScopeSelector";
import type { StaffAdapter } from "./adapter";
import { MembershipStatusActions } from "./MembershipStatusActions";
import type {
  AccessScopeOption,
  MembershipStatus,
  RoleOption,
  RoleScopeAssignmentInput,
  StaffDetail,
} from "./model";
import { RoleSelector } from "./RoleSelector";
import { StaffAssignmentList } from "./StaffAssignmentList";
import { describeMembershipStatus, membershipStatusLabel } from "./status";
import { StaffUnavailable } from "./StaffUnavailable";
import { describeStaffWriteError } from "./write-errors";

export interface StaffDetailScreenProps {
  adapter: StaffAdapter | null;
  membershipId: string;
  /** Server-derived: whether this caller may mutate staff (lifecycle + assignments). UX only. */
  canManage: boolean;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

/**
 * Read-and-manage detail for one staff member. With no adapter (Staff SDK not integrated) it shows the
 * unavailable state. With an adapter it loads the projection and renders identity, membership status,
 * and authorization assignments (role + scope PER assignment). Lifecycle and assignment mutations are
 * offered only to a manager; a deactivated membership stays fully READABLE and offers no delete. Every
 * mutation re-reads the authoritative record on success — the screen never shows a locally assumed value.
 */
export function StaffDetailScreen({
  adapter,
  membershipId,
  canManage,
  onBack,
  generateIdempotencyKey,
}: StaffDetailScreenProps) {
  if (!adapter) {
    return (
      <ScrollScreen>
        <StaffUnavailable title="Staff member" onBack={onBack} />
      </ScrollScreen>
    );
  }
  return (
    <StaffDetailContent
      adapter={adapter}
      membershipId={membershipId}
      canManage={canManage}
      onBack={onBack}
      generateIdempotencyKey={generateIdempotencyKey}
    />
  );
}

function StaffDetailContent({
  adapter,
  membershipId,
  canManage,
  onBack,
  generateIdempotencyKey,
}: StaffDetailScreenProps & { adapter: StaffAdapter }) {
  const generateKey = generateIdempotencyKey ?? secureIdempotencyKey;
  const load = useCallback(() => adapter.getStaff(membershipId), [adapter, membershipId]);
  const { state, reload } = useAsync<StaffDetail>(load);

  // Keep the latest reload behind a ref so the success effects can re-read without re-subscribing.
  const latestReload = useRef(reload);
  useEffect(() => {
    latestReload.current = reload;
  });
  // Stable re-read callback for child panels (avoids re-running their success effects each render).
  const reloadDetail = useCallback(() => latestReload.current(), []);

  const lifecycleMutation = useMutation<MembershipStatus, StaffDetail>(
    (status, key) => adapter.updateMembershipStatus(membershipId, status, key),
    generateKey,
  );
  const unassignMutation = useMutation<string, StaffDetail>(
    (assignmentId, key) => adapter.unassignRoleScope(membershipId, assignmentId, key),
    generateKey,
  );

  useEffect(() => {
    if (lifecycleMutation.state.status === "success") latestReload.current();
  }, [lifecycleMutation.state]);
  useEffect(() => {
    if (unassignMutation.state.status === "success") latestReload.current();
  }, [unassignMutation.state]);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Staff" title="Staff member" onBack={onBack} />
        <Divider />
        <LoadingBlock label="Loading staff member…" />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Staff" title={errorHeading(state.error.kind)} onBack={onBack} />
        <Divider />
        <Body>{state.error.message}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label="Try again" onPress={reload} />
        ) : null}
      </ScrollScreen>
    );
  }

  const staff = state.data;
  const lifecycleBusy = lifecycleMutation.state.status === "submitting";
  const unassignBusy = unassignMutation.state.status === "submitting";
  const lifecycleError =
    lifecycleMutation.state.status === "error" ? lifecycleMutation.state.error : null;
  const unassignError =
    unassignMutation.state.status === "error" ? unassignMutation.state.error : null;

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Staff" title={staff.identity.displayName} onBack={onBack} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Badge label={membershipStatusLabel(staff.status)} testID="staff-detail-status" />
      </View>
      <Body>{describeMembershipStatus(staff.status)}</Body>
      <Divider />

      <Eyebrow>Identity</Eyebrow>
      <InfoRow label="Name" value={staff.identity.displayName} />
      {staff.identity.primaryEmail ? (
        <InfoRow label="Email" value={staff.identity.primaryEmail} />
      ) : null}
      {staff.identity.identityStatus ? (
        <InfoRow label="Identity status" value={staff.identity.identityStatus} />
      ) : null}
      <InfoRow label="Membership id" value={staff.membershipId} />
      {staff.createdAt ? <InfoRow label="Added" value={staff.createdAt} /> : null}
      {staff.updatedAt ? <InfoRow label="Updated" value={staff.updatedAt} /> : null}
      <Divider />

      <Eyebrow>Roles &amp; access scopes</Eyebrow>
      <Body>Each assignment grants one role at one access scope.</Body>
      <StaffAssignmentList
        assignments={staff.assignments}
        canManage={canManage}
        busy={unassignBusy}
        onUnassign={(assignmentId) => unassignMutation.submit(assignmentId)}
      />
      {unassignError ? (
        <WriteError
          described={describeStaffWriteError(unassignError)}
          onRetry={() => unassignMutation.retry()}
          onDismiss={() => unassignMutation.reset()}
          testID="staff-unassign-error"
        />
      ) : null}

      {canManage ? (
        <AddAssignment
          adapter={adapter}
          membershipId={membershipId}
          disabled={staff.status === "deactivated"}
          generateKey={generateKey}
          onAssigned={reloadDetail}
        />
      ) : null}

      {canManage ? (
        <>
          <Divider />
          <MembershipStatusActions
            status={staff.status}
            busy={lifecycleBusy}
            onChangeStatus={(next) => lifecycleMutation.submit(next)}
          />
          {lifecycleError ? (
            <WriteError
              described={describeStaffWriteError(lifecycleError)}
              onRetry={() => lifecycleMutation.retry()}
              onDismiss={() => lifecycleMutation.reset()}
              testID="staff-lifecycle-error"
            />
          ) : null}
        </>
      ) : null}
    </ScrollScreen>
  );
}

/**
 * The add-assignment panel: choose an EXISTING role + EXISTING access scope and assign it. Roles and
 * scopes are adapter-driven; the server enforces anti-escalation, so a visible option is never assumed
 * assignable until the API accepts it. Disabled for a deactivated membership.
 */
function AddAssignment({
  adapter,
  membershipId,
  disabled,
  generateKey,
  onAssigned,
}: {
  adapter: StaffAdapter;
  membershipId: string;
  disabled: boolean;
  generateKey: IdempotencyKeyFactory;
  onAssigned: () => void;
}) {
  const loadOptions = useCallback(
    async (): Promise<{ roles: RoleOption[]; scopes: AccessScopeOption[] }> => ({
      roles: await adapter.listAssignableRoles(),
      scopes: await adapter.listAssignableScopes(),
    }),
    [adapter],
  );
  const { state, reload } = useAsync(loadOptions);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(null);

  const mutation = useMutation<RoleScopeAssignmentInput, StaffDetail>(
    (input, key) => adapter.assignRoleScope(membershipId, input, key),
    generateKey,
  );

  // On a successful assignment, ask the parent to re-read the authoritative detail. That reload puts the
  // detail into its loading state and unmounts this panel, so a fresh mount naturally clears the local
  // role/scope selection and mutation — no setState-in-effect needed. `onAssigned` is a stable callback.
  const settled = mutation.state.status === "success";
  useEffect(() => {
    if (settled) onAssigned();
  }, [settled, onAssigned]);

  return (
    <View style={{ gap: 8 }} testID="staff-add-assignment">
      <Divider />
      <Eyebrow>Add a role &amp; scope</Eyebrow>
      {disabled ? (
        <Body testID="staff-add-assignment-disabled">
          Reactivate this membership before assigning new roles or scopes.
        </Body>
      ) : state.status === "loading" ? (
        <LoadingBlock label="Loading assignable roles and scopes…" />
      ) : state.status === "error" ? (
        <View style={{ gap: 8 }}>
          <Body>{state.error.message}</Body>
          {isRetryable(state.error.kind) ? (
            <PrimaryButton label="Try again" onPress={reload} />
          ) : null}
        </View>
      ) : (
        <>
          <RoleSelector
            roles={state.data.roles}
            selectedRoleId={roleId}
            onSelect={setRoleId}
            testIDPrefix="staff-add-role"
          />
          <AccessScopeSelector
            scopes={state.data.scopes}
            selectedScopeId={scopeId}
            onSelect={setScopeId}
            testIDPrefix="staff-add-scope"
          />
          <PrimaryButton
            label={mutation.state.status === "submitting" ? "Assigning…" : "Assign role & scope"}
            testID="staff-add-assignment-submit"
            disabled={!roleId || !scopeId || mutation.state.status === "submitting"}
            onPress={() => {
              if (roleId && scopeId) mutation.submit({ roleId, scopeId });
            }}
          />
          {mutation.state.status === "error" ? (
            <WriteError
              described={describeStaffWriteError(mutation.state.error)}
              onRetry={() => mutation.retry()}
              onDismiss={() => mutation.reset()}
              testID="staff-add-assignment-error"
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function WriteError({
  described,
  onRetry,
  onDismiss,
  testID,
}: {
  described: ReturnType<typeof describeStaffWriteError>;
  onRetry: () => void;
  onDismiss: () => void;
  testID: string;
}) {
  return (
    <View style={{ gap: 8 }} testID={testID}>
      <Title>{described.heading}</Title>
      <Body>{described.message}</Body>
      {described.recovery === "retry" ? (
        <PrimaryButton label="Retry" onPress={onRetry} />
      ) : (
        <TextButton label="Dismiss" onPress={onDismiss} />
      )}
    </View>
  );
}

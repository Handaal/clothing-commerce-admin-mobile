import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { errorHeading, isRetryable } from "../products/display";
import {
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
import { useToast } from "../ui/Toast";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import { AccessScopeSelector } from "./AccessScopeSelector";
import type { StaffAdapter } from "./adapter";
import type {
  AccessScopeOption,
  AddStaffInput,
  EligibleIdentity,
  RoleOption,
  RoleScopeAssignmentInput,
  StaffDetail,
} from "./model";
import { isAddStaffComplete } from "./model";
import { EligibleIdentityLookup } from "./EligibleIdentityLookup";
import { RoleSelector } from "./RoleSelector";
import { accessScopeTargetLines } from "./scopes";
import { StaffUnavailable } from "./StaffUnavailable";
import { describeStaffWriteError } from "./write-errors";

export interface AddStaffFlowProps {
  adapter: StaffAdapter | null;
  onCreated: (staff: StaffDetail) => void;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

type Step = "identity" | "role" | "scope" | "review";

interface Selection {
  identity: EligibleIdentity | null;
  roleId: string | null;
  scopeId: string | null;
}

interface Assignables {
  roles: RoleOption[];
  scopes: AccessScopeOption[];
}

/**
 * The Add-Staff workflow: link an EXISTING identity to the tenant with an initial Role + AccessScope.
 *
 * Business decision (V1): Add-Staff = link an existing provisioned identity — no Clerk invitation, no
 * email send, no passwords. The four steps are (1) find an eligible account by its EXACT email and
 * confirm it, (2) choose an initial role, (3) choose an EXISTING access scope, (4) review and create the
 * membership. Identity discovery is an exact-email lookup, never a directory browse. Assignable roles
 * and scopes are adapter-driven; there is NO fake success — `onCreated` fires only with the adapter's
 * real response. With no adapter (Staff SDK not integrated) it shows the unavailable state.
 */
export function AddStaffFlow({
  adapter,
  onCreated,
  onBack,
  generateIdempotencyKey,
}: AddStaffFlowProps) {
  if (!adapter) {
    return (
      <ScrollScreen>
        <StaffUnavailable title="Add staff" onBack={onBack} />
      </ScrollScreen>
    );
  }
  return (
    <AddStaffContent
      adapter={adapter}
      onCreated={onCreated}
      onBack={onBack}
      generateIdempotencyKey={generateIdempotencyKey}
    />
  );
}

function AddStaffContent({
  adapter,
  onCreated,
  onBack,
  generateIdempotencyKey,
}: AddStaffFlowProps & { adapter: StaffAdapter }) {
  const generateKey = generateIdempotencyKey ?? secureIdempotencyKey;
  const { t } = useI18n();

  const loadAssignables = useCallback(
    async (): Promise<Assignables> => ({
      roles: await adapter.listAssignableRoles(),
      scopes: await adapter.listAssignableScopes(),
    }),
    [adapter],
  );
  const { state, reload } = useAsync<Assignables>(loadAssignables);

  const [step, setStep] = useState<Step>("identity");
  const [selection, setSelection] = useState<Selection>({
    identity: null,
    roleId: null,
    scopeId: null,
  });

  // Add-Staff is two INDEPENDENT idempotency domains: create the membership, then assign role+scope. The
  // created membership id and the intended initial assignment are held in refs (set in event handlers /
  // effects, never during render) so a create success is never lost, the assign step reads the id without
  // re-subscribing, and the create is never repeated on an assign retry.
  const createdMembershipId = useRef<string | null>(null);
  const pendingAssign = useRef<RoleScopeAssignmentInput | null>(null);

  const toast = useToast();
  const createMutation = useMutation<string, StaffDetail>(
    (identityId, key) => adapter.createStaffMembership(identityId, key),
    generateKey,
    {
      onError: (error) => {
        const described = describeStaffWriteError(error);
        toast.error(described.message, { title: described.heading });
      },
    },
  );
  const assignMutation = useMutation<RoleScopeAssignmentInput, StaffDetail>(
    (input, key) => {
      const membershipId = createdMembershipId.current;
      if (!membershipId) return Promise.reject(new Error("No membership to assign to"));
      return adapter.assignRoleScope(membershipId, input, key);
    },
    generateKey,
    {
      onSuccess: (detail) =>
        toast.success(`“${detail.identity.displayName}” was added to this business.`, {
          title: "Staff added",
        }),
      onError: (error) => {
        const described = describeStaffWriteError(error);
        toast.error(described.message, { title: described.heading });
      },
    },
  );

  // Keep the latest assign trigger behind a ref (updated in an effect, not during render) so the
  // create-success effect below can start the initial assignment without depending on the unstable
  // mutation object.
  const startAssign = useRef<(input: RoleScopeAssignmentInput) => void>(() => {});
  useEffect(() => {
    startAssign.current = (input) => assignMutation.submit(input);
  });

  // The membership once step 1 succeeds — derived straight from the create result (no extra state). On
  // that success, kick off the initial assignment EXACTLY once (its own key). A later assign retry never
  // re-runs this, and the create is never repeated.
  const createData = createMutation.state.status === "success" ? createMutation.state.data : null;
  useEffect(() => {
    if (!createData || !pendingAssign.current) return;
    createdMembershipId.current = createData.membershipId;
    startAssign.current(pendingAssign.current);
  }, [createData]);

  // FINAL success: membership created AND initial role+scope assigned. Render the authoritative detail.
  if (assignMutation.state.status === "success") {
    const finalDetail = assignMutation.state.data;
    return (
      <ScrollScreen>
        <PageHeader eyebrow={t("staff.eyebrow")} title={t("addStaff.addedTitle")} onBack={onBack} />
        <Divider />
        <Body>{t("addStaff.addedBody", { name: finalDetail.identity.displayName })}</Body>
        <PrimaryButton
          testID="add-staff-view"
          label={t("addStaff.viewMember")}
          onPress={() => onCreated(finalDetail)}
        />
        <TextButton label={t("addStaff.backToStaff")} onPress={onBack} />
      </ScrollScreen>
    );
  }

  // PARTIAL state: the membership exists but the initial assignment has not completed. The create is
  // done and must NOT be repeated; the person exists with ZERO effective permissions until assigned.
  const createdDetail = createData;
  if (createdDetail) {
    return (
      <PartialAssignment
        person={createdDetail.identity.displayName}
        selectedRoleLabel={
          (state.status === "success"
            ? state.data.roles.find((role) => role.id === selection.roleId)?.label
            : undefined) ?? null
        }
        selectedScopeLabel={
          (state.status === "success"
            ? state.data.scopes.find((scope) => scope.id === selection.scopeId)?.label
            : undefined) ?? null
        }
        assignMutation={assignMutation}
        onOpenStaff={() => onCreated(createdDetail)}
        onBack={onBack}
      />
    );
  }

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow={t("staff.eyebrow")} title={t("addStaff.title")} onBack={onBack} />
        <Divider />
        <LoadingBlock label={t("staffDetail.loadingOptions")} />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("staff.eyebrow")}
          title={errorHeading(state.error.kind)}
          onBack={onBack}
        />
        <Divider />
        <Body>{state.error.message}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label={t("common.tryAgain")} onPress={reload} />
        ) : null}
      </ScrollScreen>
    );
  }

  const { roles, scopes } = state.data;
  const selectedRole = roles.find((role) => role.id === selection.roleId) ?? null;
  const selectedScope = scopes.find((scope) => scope.id === selection.scopeId) ?? null;
  const draft: Partial<AddStaffInput> = {
    ...(selection.identity ? { identityId: selection.identity.identityId } : {}),
    ...(selection.roleId ? { roleId: selection.roleId } : {}),
    ...(selection.scopeId ? { scopeId: selection.scopeId } : {}),
  };
  // The review submit runs step 1 (create membership). Its failure recovers here; the assign step only
  // begins once the create succeeds (handled above, outside the wizard).
  const submitError = createMutation.state.status === "error" ? createMutation.state.error : null;
  const submitting = createMutation.state.status === "submitting";

  return (
    <ScrollScreen>
      <PageHeader eyebrow={t("staff.eyebrow")} title={t("addStaff.title")} onBack={onBack} />
      <StepIndicator step={step} />
      <Divider />

      {step === "identity" ? (
        <View style={{ gap: 12 }} testID="add-staff-step-identity">
          <Eyebrow>{t("addStaff.step1")}</Eyebrow>
          <EligibleIdentityLookup
            adapter={adapter}
            selectedIdentityId={selection.identity?.identityId ?? null}
            onSelect={(identity) => setSelection((prev) => ({ ...prev, identity }))}
          />
          {selection.identity ? (
            <PrimaryButton
              label={t("addStaff.nextRole")}
              testID="add-staff-next-role"
              onPress={() => setStep("role")}
            />
          ) : null}
        </View>
      ) : null}

      {step === "role" ? (
        <View style={{ gap: 12 }} testID="add-staff-step-role">
          <Eyebrow>{t("addStaff.step2")}</Eyebrow>
          <RoleSelector
            roles={roles}
            selectedRoleId={selection.roleId}
            onSelect={(roleId) => setSelection((prev) => ({ ...prev, roleId }))}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TextButton label={t("common.backShort")} onPress={() => setStep("identity")} />
            {selection.roleId ? (
              <PrimaryButton
                label={t("addStaff.nextScope")}
                testID="add-staff-next-scope"
                onPress={() => setStep("scope")}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {step === "scope" ? (
        <View style={{ gap: 12 }} testID="add-staff-step-scope">
          <Eyebrow>{t("addStaff.step3")}</Eyebrow>
          <AccessScopeSelector
            scopes={scopes}
            selectedScopeId={selection.scopeId}
            onSelect={(scopeId) => setSelection((prev) => ({ ...prev, scopeId }))}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TextButton label={t("common.backShort")} onPress={() => setStep("role")} />
            {selection.scopeId ? (
              <PrimaryButton
                label={t("addStaff.nextReview")}
                testID="add-staff-next-review"
                onPress={() => setStep("review")}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {step === "review" ? (
        <View style={{ gap: 12 }} testID="add-staff-step-review">
          <Eyebrow>{t("addStaff.step4")}</Eyebrow>
          {selection.identity ? (
            <>
              <InfoRow label={t("addStaff.person")} value={selection.identity.displayName} />
              {selection.identity.email ? (
                <InfoRow label={t("staff.email")} value={selection.identity.email} />
              ) : null}
            </>
          ) : null}
          {selectedRole ? <InfoRow label={t("addStaff.role")} value={selectedRole.label} /> : null}
          {selectedScope ? (
            <>
              <InfoRow label={t("addStaff.scope")} value={selectedScope.label} />
              {accessScopeTargetLines(selectedScope).map((line, index) => (
                <Body key={`review-scope-${index}`}>{line}</Body>
              ))}
            </>
          ) : null}
          <Body>{t("addStaff.reviewBody")}</Body>

          {submitError ? (
            <SubmitError
              described={describeStaffWriteError(submitError)}
              mutation={createMutation}
            />
          ) : null}

          <View style={{ flexDirection: "row", gap: 12 }}>
            <TextButton label={t("common.backShort")} onPress={() => setStep("scope")} />
            <PrimaryButton
              label={submitting ? t("addStaff.submitting") : t("addStaff.submit")}
              testID="add-staff-submit"
              disabled={submitting || !isAddStaffComplete(draft)}
              onPress={() => {
                if (isAddStaffComplete(draft) && selection.identity) {
                  // Capture the intended initial assignment now (event handler, never render); the
                  // create-success effect starts it under its own independent idempotency key.
                  pendingAssign.current = { roleId: draft.roleId, scopeId: draft.scopeId };
                  createMutation.submit(selection.identity.identityId);
                }
              }}
            />
          </View>
        </View>
      ) : null}
    </ScrollScreen>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const { t } = useI18n();
  const order: Step[] = ["identity", "role", "scope", "review"];
  const current = order.indexOf(step) + 1;
  return <Eyebrow testID="add-staff-step-indicator">{t("addStaff.step", { current })}</Eyebrow>;
}

function SubmitError({
  described,
  mutation,
}: {
  described: ReturnType<typeof describeStaffWriteError>;
  mutation: ReturnType<typeof useMutation<string, StaffDetail>>;
}) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 8 }} testID="add-staff-error">
      <Title>{described.heading}</Title>
      <Body>{described.message}</Body>
      {described.recovery === "retry" ? (
        // Ambiguous failure: retry reuses the SAME idempotency key (at-most-once at the API).
        <PrimaryButton
          label={t("common.retry")}
          testID="add-staff-retry"
          onPress={() => mutation.retry()}
        />
      ) : described.recovery === "edit" ? (
        <PrimaryButton
          label={t("addStaff.editRetry")}
          testID="add-staff-edit"
          onPress={() => mutation.reset()}
        />
      ) : (
        <TextButton label={t("common.dismiss")} onPress={() => mutation.reset()} />
      )}
    </View>
  );
}

/**
 * Partial-completion recovery: the membership was CREATED but the initial role+scope assignment did not
 * complete. This is a real, security-safe intermediate state — the person exists with ZERO effective
 * permissions until an assignment lands — so the UI reports it honestly rather than as "nothing happened"
 * or as full success. The create is DONE and is never repeated. The manager can either retry ONLY the
 * assignment (an ambiguous failure retries under the SAME assignment key — never a new create) or open the
 * staff record to complete/adjust access there. While the assignment is in flight this shows progress.
 */
function PartialAssignment({
  person,
  selectedRoleLabel,
  selectedScopeLabel,
  assignMutation,
  onOpenStaff,
  onBack,
}: {
  person: string;
  selectedRoleLabel: string | null;
  selectedScopeLabel: string | null;
  assignMutation: ReturnType<typeof useMutation<RoleScopeAssignmentInput, StaffDetail>>;
  onOpenStaff: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const assigning = assignMutation.state.status === "submitting";
  const described =
    assignMutation.state.status === "error"
      ? describeStaffWriteError(assignMutation.state.error)
      : null;
  return (
    <ScrollScreen>
      <PageHeader eyebrow={t("staff.eyebrow")} title={t("addStaff.finishTitle")} onBack={onBack} />
      <Divider />
      <Body>{t("addStaff.finishBody", { name: person })}</Body>
      {selectedRoleLabel ? <InfoRow label={t("addStaff.role")} value={selectedRoleLabel} /> : null}
      {selectedScopeLabel ? (
        <InfoRow label={t("addStaff.scope")} value={selectedScopeLabel} />
      ) : null}

      {assigning ? <LoadingBlock label={t("addStaff.assigning")} /> : null}

      {described ? (
        <View style={{ gap: 8 }} testID="add-staff-partial-error">
          <Title>{described.heading}</Title>
          <Body>{described.message}</Body>
        </View>
      ) : null}

      {!assigning ? (
        <View style={{ gap: 12 }}>
          {/* Retry ONLY the assignment. An ambiguous failure reuses the SAME assignment key; a fresh
              intent (different role/scope) is chosen from the staff record instead. Create never re-runs. */}
          <PrimaryButton
            label={t("addStaff.retryAssignment")}
            testID="add-staff-partial-retry"
            onPress={() => assignMutation.retry()}
          />
          <PrimaryButton
            label={t("addStaff.openRecord")}
            testID="add-staff-partial-open"
            onPress={onOpenStaff}
          />
        </View>
      ) : null}
    </ScrollScreen>
  );
}

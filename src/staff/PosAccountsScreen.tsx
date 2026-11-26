import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import type {
  AssignableStaffRole,
  AssignableStaffScope,
  PosLoginSummary,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";

import { useI18n } from "../i18n";
import {
  Badge,
  Body,
  InfoRow,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  SkeletonRows,
  TextButton,
  TextField,
} from "../ui/components";

/**
 * ADR-043 — the Clerk-free bootstrap for the POS. The POS has no Clerk at all, so the business owner (already
 * signed in to Admin Mobile with its own, unchanged authentication) creates the FIRST POS admin here; that admin
 * then manages further POS accounts in the POS Team desk. Everything goes through the existing authorized API
 * (`createPosLogin`: tenant-wide `staff.manage` + anti-escalation re-checked server-side). There is no default PIN,
 * no support code and no open registration: the owner chooses the PIN, it is sent once over the protected
 * transport for server-side hashing, and it is never stored, logged or shown again.
 *
 * PIN rule (same as the API and the POS): ASCII digits only, at least 4, NO maximum, never filtered or truncated.
 */
export type PosAccountsClient = Pick<
  TenantCommerceClient,
  "listPosLogins" | "createPosLogin" | "listAssignableStaffRoles" | "listAssignableStaffScopes"
>;

export const POS_PIN_MIN_LENGTH = 4;
export function isPosPinFormat(value: string): boolean {
  return value.length >= POS_PIN_MIN_LENGTH && /^[0-9]+$/.test(value);
}
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,30}$/;

type PosRole = "admin" | "cashier";
interface Draft {
  displayName: string;
  username: string;
  pin: string;
  posRole: PosRole;
  roleId: string | null;
  scopeId: string | null;
}
const EMPTY: Draft = {
  displayName: "",
  username: "",
  pin: "",
  posRole: "admin",
  roleId: null,
  scopeId: null,
};

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `pos-login-${Date.now()}-${Math.random()}`;
}

export interface PosAccountsScreenProps {
  client: PosAccountsClient | null;
  canManage: boolean;
  onBack: () => void;
}

export function PosAccountsScreen({ client, canManage, onBack }: PosAccountsScreenProps) {
  const { t } = useI18n();
  const [items, setItems] = useState<readonly PosLoginSummary[] | null>(null);
  const [roles, setRoles] = useState<readonly AssignableStaffRole[]>([]);
  const [scopes, setScopes] = useState<readonly AssignableStaffScope[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey);

  const load = useCallback(async () => {
    if (!client) return;
    setLoadError(false);
    try {
      const [logins, roleList, scopeList] = await Promise.all([
        client.listPosLogins(),
        client.listAssignableStaffRoles(),
        client.listAssignableStaffScopes(),
      ]);
      setItems(logins.items);
      setRoles(roleList.items);
      setScopes(scopeList.items);
    } catch {
      setLoadError(true);
    }
  }, [client]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial external read (server list)
    void load();
  }, [load]);

  const startCreate = () => {
    const tenantScope = scopes.find((scope) => scope.scopeMode === "tenant") ?? scopes[0] ?? null;
    const managerRole =
      roles.find((role) => role.permissionKeys.includes("staff.manage")) ?? roles[0] ?? null;
    setDraft({
      ...EMPTY,
      posRole: (items ?? []).some((item) => item.posRole === "admin") ? "cashier" : "admin",
      roleId: managerRole?.roleId ?? null,
      scopeId: tenantScope?.accessScopeId ?? null,
    });
    setKey(newKey());
    setFieldError(null);
    setNotice(null);
  };

  const save = async () => {
    if (!client || !draft || busy) return;
    const username = draft.username.trim().toLowerCase();
    if (draft.displayName.trim() === "") return setFieldError(t("posAccounts.err.name"));
    if (!USERNAME_PATTERN.test(username)) return setFieldError(t("posAccounts.err.username"));
    if (!isPosPinFormat(draft.pin)) return setFieldError(t("posAccounts.err.pin"));
    if (!draft.roleId || !draft.scopeId) return setFieldError(t("posAccounts.err.access"));
    setBusy(true);
    setFieldError(null);
    try {
      await client.createPosLogin({
        idempotencyKey: key,
        username,
        pin: draft.pin,
        displayName: draft.displayName.trim(),
        roleId: draft.roleId,
        accessScopeId: draft.scopeId,
        posRole: draft.posRole,
        posPermissions: [],
      });
      setDraft(null);
      setNotice({ tone: "success", text: t("posAccounts.created", { username }) });
      await load();
    } catch (error) {
      // The PIN is cleared on any failure and never echoed.
      setDraft((current) => (current ? { ...current, pin: "" } : current));
      const code = error instanceof ApiHttpError ? error.code : undefined;
      const status = error instanceof ApiHttpError ? error.status : undefined;
      setNotice({
        tone: "danger",
        text:
          code === "USERNAME_TAKEN" || status === 409
            ? t("posAccounts.err.taken")
            : status === 403
              ? t("posAccounts.err.denied")
              : status === 400
                ? t("posAccounts.err.pin")
                : t("posAccounts.err.save"),
      });
    } finally {
      setBusy(false);
    }
  };

  if (!client) {
    return (
      <ScrollScreen>
        <PageHeader title={t("posAccounts.title")} />
        <Notice tone="warning" message={t("posAccounts.unavailable")} />
        <TextButton label={t("posAccounts.back")} onPress={onBack} />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <PageHeader title={t("posAccounts.title")} icon="account-group" />
      {notice ? (
        <Notice tone={notice.tone} message={notice.text} testID="pos-accounts-notice" />
      ) : null}
      {loadError ? (
        <Notice
          tone="danger"
          message={t("posAccounts.loadError")}
          action={<TextButton label={t("posAccounts.retry")} onPress={() => void load()} />}
        />
      ) : items === null ? (
        <SkeletonRows rows={3} />
      ) : items.length === 0 ? (
        <Notice tone="info" message={t("posAccounts.empty")} testID="pos-accounts-empty" />
      ) : (
        <View>
          {items.map((item) => (
            <View key={item.membershipId} testID={`pos-account-${item.username}`}>
              <InfoRow label={item.displayName ?? item.username} value={`@${item.username}`} />
              <Badge
                label={t(
                  item.posRole === "admin" ? "posAccounts.role.admin" : "posAccounts.role.cashier",
                )}
                tone={item.status === "active" ? "success" : "neutral"}
              />
            </View>
          ))}
        </View>
      )}

      {canManage && draft === null ? (
        <PrimaryButton
          label={t("posAccounts.add")}
          onPress={startCreate}
          testID="pos-accounts-add"
          disabled={items === null}
        />
      ) : null}
      {!canManage ? <Body>{t("posAccounts.readOnly")}</Body> : null}

      {draft ? (
        <View testID="pos-accounts-form">
          <TextField
            label={t("posAccounts.field.name")}
            value={draft.displayName}
            onChangeText={(displayName) => setDraft({ ...draft, displayName })}
            testID="pos-accounts-name"
            required
          />
          <TextField
            label={t("posAccounts.field.username")}
            value={draft.username}
            onChangeText={(username) => setDraft({ ...draft, username })}
            autoCapitalize="none"
            testID="pos-accounts-username"
            required
          />
          <TextField
            label={t("posAccounts.field.pin")}
            value={draft.pin}
            onChangeText={(pin) => setDraft({ ...draft, pin })}
            hint={t("posAccounts.pinRule")}
            secure
            numeric
            testID="pos-accounts-pin"
            required
          />
          <SelectField
            label={t("posAccounts.field.posRole")}
            options={[
              { value: "admin", label: t("posAccounts.role.admin") },
              { value: "cashier", label: t("posAccounts.role.cashier") },
            ]}
            selected={draft.posRole}
            onSelect={(value) => setDraft({ ...draft, posRole: value as PosRole })}
            testIDPrefix="pos-accounts-posrole"
          />
          <SelectField
            label={t("posAccounts.field.apiRole")}
            options={roles.map((role) => ({ value: role.roleId, label: role.roleName }))}
            selected={draft.roleId}
            onSelect={(roleId) => setDraft({ ...draft, roleId })}
            testIDPrefix="pos-accounts-role"
          />
          <SelectField
            label={t("posAccounts.field.scope")}
            options={scopes.map((scope) => ({
              value: scope.accessScopeId,
              label: scope.scopeName,
            }))}
            selected={draft.scopeId}
            onSelect={(scopeId) => setDraft({ ...draft, scopeId })}
            testIDPrefix="pos-accounts-scope"
          />
          {fieldError ? (
            <Notice tone="danger" message={fieldError} testID="pos-accounts-error" />
          ) : null}
          <PrimaryButton
            label={busy ? t("posAccounts.saving") : t("posAccounts.create")}
            onPress={() => void save()}
            disabled={busy}
            testID="pos-accounts-save"
          />
          <TextButton label={t("posAccounts.cancel")} onPress={() => setDraft(null)} />
        </View>
      ) : null}
      <TextButton label={t("posAccounts.back")} onPress={onBack} />
    </ScrollScreen>
  );
}

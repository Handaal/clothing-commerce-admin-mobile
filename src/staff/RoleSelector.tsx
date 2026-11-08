import { View } from "react-native";

import { useI18n } from "../i18n";
import { Body, Eyebrow, SelectField, type SelectOption } from "../ui/components";
import type { RoleOption } from "./model";

export interface RoleSelectorProps {
  /** EXISTING assignable roles, provided by the adapter. This UI never creates/edits roles or permissions. */
  roles: RoleOption[];
  selectedRoleId: string | null;
  onSelect: (roleId: string) => void;
  testIDPrefix?: string;
}

/**
 * Selection UX for an EXISTING role. Role options are adapter-driven — the app never authors roles,
 * edits permissions, or decides assignability from a role name. The server enforces anti-escalation, so
 * a visible role is not assumed to be assignable until the API accepts it; a rejection surfaces via the
 * shared staff write-error surface, never as a silent success.
 */
export function RoleSelector({
  roles,
  selectedRoleId,
  onSelect,
  testIDPrefix = "staff-role",
}: RoleSelectorProps) {
  const { t } = useI18n();
  const options: SelectOption[] = roles.map((role) => ({ value: role.id, label: role.label }));
  const selected = roles.find((role) => role.id === selectedRoleId) ?? null;

  return (
    <View style={{ gap: 8 }} testID={`${testIDPrefix}-selector`}>
      <SelectField
        label={t("staffRole.label")}
        options={options}
        selected={selectedRoleId}
        onSelect={onSelect}
        testIDPrefix={testIDPrefix}
        emptyLabel={t("staffRole.emptyLabel")}
      />
      {selected?.permissionSummary ? (
        <View style={{ gap: 4 }} testID={`${testIDPrefix}-summary`}>
          <Eyebrow>{t("staffRole.grants")}</Eyebrow>
          <Body>{selected.permissionSummary}</Body>
        </View>
      ) : null}
    </View>
  );
}

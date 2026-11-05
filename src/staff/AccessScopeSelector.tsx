import { View } from "react-native";

import { useI18n } from "../i18n";
import { Body, Eyebrow, SelectField, type SelectOption } from "../ui/components";
import type { AccessScopeOption } from "./model";
import { accessScopeKindLabel, accessScopeTargetLines } from "./scopes";

export interface AccessScopeSelectorProps {
  /** EXISTING access scopes, provided by the adapter. This UI never creates or edits scopes. */
  scopes: AccessScopeOption[];
  selectedScopeId: string | null;
  onSelect: (scopeId: string) => void;
  testIDPrefix?: string;
}

/**
 * Selection UX for an EXISTING access scope. It renders enough human-readable information that a manager
 * understands each scope (Tenant-wide, or Branch/Location target lines), but the exact target rendering
 * stays domain-driven — the option's `targets` come from the adapter, never re-derived here. It creates
 * no scopes and no branch/location targets.
 */
export function AccessScopeSelector({
  scopes,
  selectedScopeId,
  onSelect,
  testIDPrefix = "staff-scope",
}: AccessScopeSelectorProps) {
  const { t } = useI18n();
  const options: SelectOption[] = scopes.map((scope) => ({
    value: scope.id,
    label: `${scope.label} · ${accessScopeKindLabel(scope.kind)}`,
  }));

  const selected = scopes.find((scope) => scope.id === selectedScopeId) ?? null;

  return (
    <View style={{ gap: 8 }} testID={`${testIDPrefix}-selector`}>
      <SelectField
        label={t("staffScope.label")}
        options={options}
        selected={selectedScopeId}
        onSelect={onSelect}
        testIDPrefix={testIDPrefix}
        emptyLabel={t("staffScope.emptyLabel")}
      />
      {selected ? (
        <View style={{ gap: 4 }} testID={`${testIDPrefix}-summary`}>
          <Eyebrow>{t("staffScope.covers")}</Eyebrow>
          {accessScopeTargetLines(selected).map((line, index) => (
            <Body key={`${selected.id}-target-${index}`}>{line}</Body>
          ))}
        </View>
      ) : null}
    </View>
  );
}

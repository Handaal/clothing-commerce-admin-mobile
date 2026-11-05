/**
 * Access-scope presentation helpers. Scopes are EXISTING platform objects — this app never creates or
 * edits scopes, and never creates branch/location targets. It only renders enough human-readable
 * information that a manager understands the scope (Tenant-wide, or Branch/Location target lines). The
 * exact target rendering is domain-driven: the adapter fills {@link AccessScopeSummary.targets} with
 * already-readable lines, so this module never re-derives branch/location naming from ids.
 */

import { t } from "../i18n";
import type { AccessScopeKind, AccessScopeSummary } from "./model";

export function accessScopeKindLabel(kind: AccessScopeKind): string {
  switch (kind) {
    case "tenant":
      return t("scopeKind.tenant");
    case "brand":
      return t("scopeKind.brand");
    case "branch":
      return t("scopeKind.branch");
    case "location":
      return t("scopeKind.location");
  }
}

/** True for a tenant-wide scope (no narrower target). */
export function isTenantWideScope(scope: AccessScopeSummary): boolean {
  return scope.kind === "tenant";
}

/**
 * Human-readable target lines for a scope. A tenant-wide scope reads as a single "Tenant-wide" line;
 * a narrower scope shows the adapter-provided target summaries verbatim (e.g. "Branch: Downtown",
 * "Location: Main Stockroom"), falling back to the scope kind label when the adapter supplied none.
 */
export function accessScopeTargetLines(scope: AccessScopeSummary): string[] {
  if (isTenantWideScope(scope)) return [t("scopeKind.tenant")];
  if (scope.targets.length > 0) return scope.targets;
  return [accessScopeKindLabel(scope.kind)];
}

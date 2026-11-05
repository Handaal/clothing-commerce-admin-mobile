/**
 * Membership-lifecycle presentation helpers. Business direction (see `current-v1-state.md`): a
 * membership is `active`, `suspended` (reversible temporary disable) or `deactivated` (revoked/terminal
 * if that remains the final API rule). A deactivated membership is RETAINED and readable — never a
 * physical delete. The eventual API stays authoritative for which transitions it actually permits; these
 * helpers only shape the UI and offer confirmed, distinct lifecycle actions.
 */

import { t } from "../i18n";
import type { MembershipStatus, MembershipStatusTarget } from "./model";
import type { StaffStatusFilter } from "./search";

export function membershipStatusLabel(status: MembershipStatus): string {
  switch (status) {
    case "invited":
      return t("staffStatus.invited");
    case "active":
      return t("staffStatus.active");
    case "suspended":
      return t("staffStatus.suspended");
    case "deactivated":
      return t("staffStatus.deactivated");
  }
}

/** A one-line explanation shown next to the status, reinforcing the lifecycle semantics. */
export function describeMembershipStatus(status: MembershipStatus): string {
  switch (status) {
    case "invited":
      return t("staffStatus.invitedDesc");
    case "active":
      return t("staffStatus.activeDesc");
    case "suspended":
      return t("staffStatus.suspendedDesc");
    case "deactivated":
      return t("staffStatus.deactivatedDesc");
  }
}

/**
 * One lifecycle action the operator can take from a given status. Destructive/terminal-feeling actions
 * carry `destructive: true` so the UI can require a confirmation. Deactivation is treated as
 * destructive; suspend/restore are reversible. `deactivated` is terminal — from it the UI offers no
 * lifecycle action here (the server remains the authority on any reactivation rule).
 */
export interface MembershipLifecycleAction {
  next: MembershipStatusTarget;
  label: string;
  confirmLabel: string;
  destructive: boolean;
}

export function membershipLifecycleActions(status: MembershipStatus): MembershipLifecycleAction[] {
  switch (status) {
    case "invited":
      // An initial membership can be activated (grant access) or deactivated (revoke). The server owns
      // the authoritative rule; these are the sensible transitions the API's status command accepts.
      return [
        {
          next: "active",
          label: t("staffAction.activate"),
          confirmLabel: t("staffAction.confirmActivate"),
          destructive: false,
        },
        {
          next: "deactivated",
          label: t("staffAction.deactivate"),
          confirmLabel: t("staffAction.confirmDeactivate"),
          destructive: true,
        },
      ];
    case "active":
      return [
        {
          next: "suspended",
          label: t("staffAction.suspend"),
          confirmLabel: t("staffAction.confirmSuspend"),
          destructive: false,
        },
        {
          next: "deactivated",
          label: t("staffAction.deactivate"),
          confirmLabel: t("staffAction.confirmDeactivate"),
          destructive: true,
        },
      ];
    case "suspended":
      return [
        {
          next: "active",
          label: t("staffAction.restore"),
          confirmLabel: t("staffAction.confirmRestore"),
          destructive: false,
        },
        {
          next: "deactivated",
          label: t("staffAction.deactivate"),
          confirmLabel: t("staffAction.confirmDeactivate"),
          destructive: true,
        },
      ];
    case "deactivated":
      // Terminal in the UI; the server owns any reactivation rule. No lifecycle action is offered.
      return [];
  }
}

export function staffStatusFilterLabel(filter: StaffStatusFilter): string {
  switch (filter) {
    case "all":
      return t("staffFilter.all");
    case "invited":
      return t("staffFilter.invited");
    case "active":
      return t("staffFilter.active");
    case "suspended":
      return t("staffFilter.suspended");
    case "deactivated":
      return t("staffFilter.deactivated");
  }
}

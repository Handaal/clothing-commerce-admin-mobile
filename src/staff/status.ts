/**
 * Membership-lifecycle presentation helpers. Business direction (see `current-v1-state.md`): a
 * membership is `active`, `suspended` (reversible temporary disable) or `deactivated` (revoked/terminal
 * if that remains the final API rule). A deactivated membership is RETAINED and readable — never a
 * physical delete. The eventual API stays authoritative for which transitions it actually permits; these
 * helpers only shape the UI and offer confirmed, distinct lifecycle actions.
 */

import type { MembershipStatus } from "./model";
import type { StaffStatusFilter } from "./search";

export function membershipStatusLabel(status: MembershipStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    case "deactivated":
      return "Deactivated";
  }
}

/** A one-line explanation shown next to the status, reinforcing the lifecycle semantics. */
export function describeMembershipStatus(status: MembershipStatus): string {
  switch (status) {
    case "active":
      return "Active — normal access to the tenant.";
    case "suspended":
      return "Suspended — access is temporarily disabled and can be restored.";
    case "deactivated":
      return "Deactivated — access is revoked. The record is retained for history, never deleted.";
  }
}

/**
 * One lifecycle action the operator can take from a given status. Destructive/terminal-feeling actions
 * carry `destructive: true` so the UI can require a confirmation. Deactivation is treated as
 * destructive; suspend/restore are reversible. `deactivated` is terminal — from it the UI offers no
 * lifecycle action here (the server remains the authority on any reactivation rule).
 */
export interface MembershipLifecycleAction {
  next: MembershipStatus;
  label: string;
  confirmLabel: string;
  destructive: boolean;
}

export function membershipLifecycleActions(status: MembershipStatus): MembershipLifecycleAction[] {
  switch (status) {
    case "active":
      return [
        {
          next: "suspended",
          label: "Suspend access",
          confirmLabel: "Confirm suspend",
          destructive: false,
        },
        {
          next: "deactivated",
          label: "Deactivate membership",
          confirmLabel: "Confirm deactivate",
          destructive: true,
        },
      ];
    case "suspended":
      return [
        {
          next: "active",
          label: "Restore access",
          confirmLabel: "Confirm restore",
          destructive: false,
        },
        {
          next: "deactivated",
          label: "Deactivate membership",
          confirmLabel: "Confirm deactivate",
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
      return "All";
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    case "deactivated":
      return "Deactivated";
  }
}

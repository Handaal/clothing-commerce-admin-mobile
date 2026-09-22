import { View } from "react-native";

import { Body, ConfirmButton, Eyebrow, PrimaryButton } from "../ui/components";
import type { MembershipStatus, MembershipStatusTarget } from "./model";
import { membershipLifecycleActions } from "./status";

export interface MembershipStatusActionsProps {
  status: MembershipStatus;
  /** Disable controls while a lifecycle mutation is in flight. */
  busy?: boolean;
  onChangeStatus: (next: MembershipStatusTarget) => void;
}

/**
 * Lifecycle controls for a membership. Destructive transitions (deactivate) require a confirmation;
 * reversible ones (suspend / restore) still confirm to avoid an accidental tap. There is NO physical
 * delete — a deactivated membership is a retained, readable record, so from `deactivated` no lifecycle
 * action is offered here and the server stays authoritative over any reactivation rule.
 */
export function MembershipStatusActions({
  status,
  busy = false,
  onChangeStatus,
}: MembershipStatusActionsProps) {
  const actions = membershipLifecycleActions(status);

  if (actions.length === 0) {
    return (
      <Body testID="staff-lifecycle-terminal">
        This membership is deactivated. It is retained for history and is never deleted.
      </Body>
    );
  }

  return (
    <View style={{ gap: 8 }} testID="staff-lifecycle-actions">
      <Eyebrow>Membership</Eyebrow>
      {actions.map((action) =>
        action.destructive ? (
          <ConfirmButton
            key={action.next}
            label={action.label}
            confirmLabel={action.confirmLabel}
            disabled={busy}
            testID={`staff-lifecycle-${action.next}`}
            onConfirm={() => onChangeStatus(action.next)}
          />
        ) : (
          <PrimaryButton
            key={action.next}
            label={action.label}
            disabled={busy}
            testID={`staff-lifecycle-${action.next}`}
            onPress={() => onChangeStatus(action.next)}
          />
        ),
      )}
    </View>
  );
}

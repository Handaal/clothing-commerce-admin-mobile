import { View } from "react-native";

import { Badge, Body, ConfirmButton, Eyebrow, InfoRow, SurfaceRow, Title } from "../ui/components";
import type { StaffAssignment } from "./model";
import { accessScopeKindLabel, accessScopeTargetLines } from "./scopes";

export interface StaffAssignmentListProps {
  assignments: StaffAssignment[];
  /** When true, each non-protected assignment offers a confirmed unassign action. */
  canManage: boolean;
  /** Disable controls while a mutation is in flight. */
  busy?: boolean;
  onUnassign?: (assignmentId: string) => void;
}

/**
 * Renders authorization assignments as Role + AccessScope PAIRS — making clear which role applies at
 * which scope, never as two unrelated lists. Each assignment can be unassigned (confirmed) when the
 * caller may manage staff, EXCEPT protected assignments, which are shown as a distinct non-actionable
 * state (the server is authoritative; the UI never offers a control it knows will be refused). The list
 * itself is read-only for a read-only caller.
 */
export function StaffAssignmentList({
  assignments,
  canManage,
  busy = false,
  onUnassign,
}: StaffAssignmentListProps) {
  if (assignments.length === 0) {
    return (
      <Body testID="staff-assignments-empty">
        No role or scope assignments yet. Assignments grant a role at a specific access scope.
      </Body>
    );
  }

  return (
    <View style={{ gap: 12 }} testID="staff-assignments">
      {assignments.map((assignment) => (
        <SurfaceRow
          key={assignment.assignmentId}
          testID={`staff-assignment-${assignment.assignmentId}`}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Title>{assignment.role.label}</Title>
            <Badge
              label={accessScopeKindLabel(assignment.scope.kind)}
              testID={`staff-assignment-kind-${assignment.assignmentId}`}
            />
          </View>
          {assignment.role.permissionSummary ? (
            <Body>{assignment.role.permissionSummary}</Body>
          ) : null}
          <Eyebrow>At scope</Eyebrow>
          <InfoRow label="Scope" value={assignment.scope.label} />
          {accessScopeTargetLines(assignment.scope).map((line, index) => (
            <Body key={`${assignment.assignmentId}-target-${index}`}>{line}</Body>
          ))}
          {assignment.isProtected ? (
            <Eyebrow testID={`staff-assignment-protected-${assignment.assignmentId}`}>
              Protected — cannot be changed here
            </Eyebrow>
          ) : canManage && onUnassign ? (
            <ConfirmButton
              label="Remove assignment"
              confirmLabel="Confirm remove"
              disabled={busy}
              testID={`staff-assignment-unassign-${assignment.assignmentId}`}
              onConfirm={() => onUnassign(assignment.assignmentId)}
            />
          ) : null}
        </SurfaceRow>
      ))}
    </View>
  );
}

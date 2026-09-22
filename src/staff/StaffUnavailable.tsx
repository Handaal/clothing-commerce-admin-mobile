import { Body, Divider, PageHeader } from "../ui/components";

/**
 * The honest production state for every Staff screen until the final Staff SDK is integrated. It
 * replaces the whole surface (list, detail, add-staff) so nothing on screen implies staff can be read
 * or written yet. There is deliberately no retry: this is not a transient failure — the real transport
 * is not connected. Nothing is stored or changed in the meantime.
 */
export function StaffUnavailable({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <>
      <PageHeader eyebrow="Staff" title={title} onBack={onBack} />
      <Divider />
      <Body testID="staff-unavailable">
        Staff management isn’t connected yet. This screen is the Admin Mobile foundation for it; the
        staff data and actions will appear here once the Commerce API’s staff surface is finalized
        and the app is connected to it. Nothing is stored or changed in the meantime.
      </Body>
    </>
  );
}

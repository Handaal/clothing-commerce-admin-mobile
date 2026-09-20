import { Body, Divider, PageHeader } from "../ui/components";

/**
 * The honest production state for every Supplier screen until the Supplier API exists. It replaces the
 * whole surface (list, detail, form) so nothing on screen implies suppliers can be read or written
 * yet. There is deliberately no retry: this is not a transient failure — the capability is not built.
 */
export function SupplierUnavailable({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <>
      <PageHeader eyebrow="Suppliers" title={title} onBack={onBack} />
      <Divider />
      <Body testID="supplier-unavailable">
        Supplier management isn’t available yet. This screen is the Admin Mobile foundation for it;
        the Supplier data and actions will appear here once the Commerce API adds the supplier
        surface and the app is connected to it. Nothing is stored or changed in the meantime.
      </Body>
    </>
  );
}

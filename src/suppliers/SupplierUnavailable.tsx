import { useI18n } from "../i18n";
import { Body, Divider, PageHeader } from "../ui/components";

/**
 * The honest production state for every Supplier screen until the Supplier API exists. It replaces the
 * whole surface (list, detail, form) so nothing on screen implies suppliers can be read or written
 * yet. There is deliberately no retry: this is not a transient failure — the capability is not built.
 */
export function SupplierUnavailable({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader eyebrow={t("suppliers.title")} title={title} onBack={onBack} />
      <Divider />
      <Body testID="supplier-unavailable">{t("supplier.unavailable")}</Body>
    </>
  );
}

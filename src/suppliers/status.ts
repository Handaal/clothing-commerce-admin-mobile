/**
 * Active/inactive presentation helpers. Business direction: an inactive supplier is a retained,
 * historically-visible record — NEVER a deletion. The eventual API decides whether an inactive
 * supplier may be chosen for new receipts; the client never treats "inactive" as "gone".
 */

import { t } from "../i18n";
import type { SupplierStatus } from "./model";
import type { SupplierStatusFilter } from "./search";

export function supplierStatusLabel(status: SupplierStatus): string {
  return status === "active" ? t("supplierStatus.active") : t("supplierStatus.inactive");
}

/** A one-line explanation shown next to the status, reinforcing that inactive is not deleted. */
export function describeSupplierStatus(status: SupplierStatus): string {
  return status === "active" ? t("supplierStatus.activeDesc") : t("supplierStatus.inactiveDesc");
}

/** The label/verb for the status-toggle confirmation control. */
export function supplierStatusToggle(status: SupplierStatus): {
  next: SupplierStatus;
  label: string;
  confirmLabel: string;
} {
  return status === "active"
    ? {
        next: "inactive",
        label: t("supplierStatus.markInactive"),
        confirmLabel: t("supplierStatus.confirmMarkInactive"),
      }
    : {
        next: "active",
        label: t("supplierStatus.markActive"),
        confirmLabel: t("supplierStatus.confirmMarkActive"),
      };
}

export function statusFilterLabel(filter: SupplierStatusFilter): string {
  switch (filter) {
    case "all":
      return t("supplierFilter.all");
    case "active":
      return t("supplierFilter.active");
    case "inactive":
      return t("supplierFilter.inactive");
  }
}

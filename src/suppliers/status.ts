/**
 * Active/inactive presentation helpers. Business direction: an inactive supplier is a retained,
 * historically-visible record — NEVER a deletion. The eventual API decides whether an inactive
 * supplier may be chosen for new receipts; the client never treats "inactive" as "gone".
 */

import type { SupplierStatus } from "./model";
import type { SupplierStatusFilter } from "./search";

export function supplierStatusLabel(status: SupplierStatus): string {
  return status === "active" ? "Active" : "Inactive";
}

/** A one-line explanation shown next to the status, reinforcing that inactive is not deleted. */
export function describeSupplierStatus(status: SupplierStatus): string {
  return status === "active"
    ? "Active — available for new receiving once the Supplier API is connected."
    : "Inactive — retained for history; not deleted. Eligibility for new receipts is server-decided.";
}

/** The label/verb for the status-toggle confirmation control. */
export function supplierStatusToggle(status: SupplierStatus): {
  next: SupplierStatus;
  label: string;
  confirmLabel: string;
} {
  return status === "active"
    ? { next: "inactive", label: "Mark inactive", confirmLabel: "Confirm mark inactive" }
    : { next: "active", label: "Mark active", confirmLabel: "Confirm mark active" };
}

export function statusFilterLabel(filter: SupplierStatusFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "active":
      return "Active";
    case "inactive":
      return "Inactive";
  }
}

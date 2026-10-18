import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

import { promotionCapabilities } from "../promotions/capabilities";
import { reportingCapabilities } from "../reporting/capabilities";
import { settingsCapabilities } from "../settings/capabilities";
import { staffCapabilities } from "../staff/capabilities";
import type { AppIconName } from "../ui/Icon";

export type ManagementSectionId =
  | "dashboard"
  | "products"
  | "orders"
  | "inventory"
  | "customers"
  | "promotions"
  | "suppliers"
  | "staff"
  | "reports"
  | "activity"
  | "settings"
  | "storefront";

export type ManagementRoute =
  | "/"
  | "/products"
  | "/orders"
  | "/inventory"
  | "/promotions"
  | "/suppliers"
  | "/staff"
  | "/reports"
  | "/settings"
  | "/storefront"
  | "/more";

export interface ManagementSection {
  id: ManagementSectionId;
  label: string;
  description: string;
  icon: AppIconName;
  route?: ManagementRoute;
  status?: "planned" | "reserved";
  visible: (context: MeContextResponse) => boolean;
}

const always = () => true;

/**
 * One mobile-owned information architecture. Capability checks are navigation guidance only; the
 * Commerce API still authorizes every request and mutation independently.
 */
export const MANAGEMENT_SECTIONS: readonly ManagementSection[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Business overview and management shortcuts.",
    icon: "view-dashboard-outline",
    route: "/",
    visible: always,
  },
  {
    id: "products",
    label: "Products",
    description: "Catalog, variants, pricing, media and publication.",
    icon: "tag-multiple-outline",
    route: "/products",
    visible: (context) => context.access.catalog.canRead,
  },
  {
    id: "orders",
    label: "Orders",
    description: "POS and online order visibility.",
    icon: "receipt-text-outline",
    route: "/orders",
    visible: (context) => context.access.orders.canRead,
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stock visibility, receiving, adjustments and transfers.",
    icon: "warehouse",
    route: "/inventory",
    visible: (context) => context.access.inventory.canRead,
  },
  {
    id: "customers",
    label: "Customers",
    description: "Awaiting a canonical customer-management API.",
    icon: "account-group-outline",
    status: "planned",
    visible: always,
  },
  {
    id: "promotions",
    label: "Promotions & vouchers",
    description: "Offers, voucher codes and promotion lifecycle.",
    icon: "ticket-percent-outline",
    route: "/promotions",
    visible: (context) => promotionCapabilities(context).canRead,
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Supplier records and receiving history.",
    icon: "truck-outline",
    route: "/suppliers",
    visible: (context) => context.access.suppliers?.canRead === true,
  },
  {
    id: "staff",
    label: "Staff",
    description: "Memberships, roles and access scopes.",
    icon: "badge-account-horizontal-outline",
    route: "/staff",
    visible: (context) => staffCapabilities(context).canRead,
  },
  {
    id: "reports",
    label: "Reports",
    description: "Sales, products, inventory, returns and supplier reporting.",
    icon: "chart-box-outline",
    route: "/reports",
    visible: (context) => reportingCapabilities(context).canRead,
  },
  {
    id: "activity",
    label: "Activity",
    description: "Awaiting a canonical management audit-log API.",
    icon: "history",
    status: "planned",
    visible: always,
  },
  {
    id: "settings",
    label: "Settings",
    description: "Business, locations, registers, policies and devices.",
    icon: "cog-outline",
    route: "/settings",
    visible: (context) => settingsCapabilities(context).canRead,
  },
  {
    id: "storefront",
    label: "Storefront",
    description: "Reserved for future website management.",
    icon: "storefront-outline",
    route: "/storefront",
    status: "reserved",
    visible: always,
  },
] as const;

export function visibleManagementSections(
  context: MeContextResponse,
): readonly ManagementSection[] {
  return MANAGEMENT_SECTIONS.filter((section) => section.visible(context));
}

export function managementSection(id: ManagementSectionId): ManagementSection {
  const section = MANAGEMENT_SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`Unknown management section: ${id}`);
  return section;
}

import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

import { attendanceCapabilities } from "../attendance/model";
import type { MessageKey } from "../i18n";
import { promotionCapabilities } from "../promotions/capabilities";
import { reportingCapabilities } from "../reporting/capabilities";
import { settingsCapabilities } from "../settings/capabilities";
import { staffCapabilities } from "../staff/capabilities";
import type { AppIconName } from "../ui/Icon";

export type ManagementSectionId =
  | "dashboard"
  | "products"
  | "collections"
  | "orders"
  | "inventory"
  | "customers"
  | "promotions"
  | "suppliers"
  | "staff"
  | "attendance"
  | "reports"
  | "activity"
  | "settings"
  | "storefront";

export type ManagementRoute =
  | "/"
  | "/products"
  | "/collections"
  | "/orders"
  | "/inventory"
  | "/customers"
  | "/promotions"
  | "/suppliers"
  | "/staff"
  | "/attendance"
  | "/reports"
  | "/settings"
  | "/storefront"
  | "/more";

export interface ManagementSection {
  id: ManagementSectionId;
  /** English source label — the UI renders `t(labelKey)`; this stays as the guaranteed fallback. */
  label: string;
  description: string;
  /** Localized message keys resolved by consumers (dashboard cards, More screen). */
  labelKey: MessageKey;
  descriptionKey: MessageKey;
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
    labelKey: "section.dashboard.label",
    descriptionKey: "section.dashboard.desc",
    icon: "view-dashboard-outline",
    route: "/",
    visible: always,
  },
  {
    id: "products",
    label: "Products",
    description: "Catalog, variants, pricing, media and publication.",
    labelKey: "section.products.label",
    descriptionKey: "section.products.desc",
    icon: "tag-multiple-outline",
    route: "/products",
    visible: (context) => context.access.catalog.canRead,
  },
  {
    id: "collections",
    label: "Collections",
    description: "Curated product groupings for the storefront.",
    labelKey: "section.collections.label",
    descriptionKey: "section.collections.desc",
    icon: "shape-outline",
    route: "/collections",
    visible: (context) => context.access.catalog.canRead,
  },
  {
    id: "orders",
    label: "Orders",
    description: "POS and online order visibility.",
    labelKey: "section.orders.label",
    descriptionKey: "section.orders.desc",
    icon: "receipt-text-outline",
    route: "/orders",
    visible: (context) => context.access.orders.canRead,
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stock visibility, receiving, adjustments and transfers.",
    labelKey: "section.inventory.label",
    descriptionKey: "section.inventory.desc",
    icon: "warehouse",
    route: "/inventory",
    visible: (context) => context.access.inventory.canRead,
  },
  {
    id: "customers",
    label: "Customers",
    description: "Customer directory, lifetime spend and order history.",
    labelKey: "section.customers.label",
    descriptionKey: "section.customers.desc",
    icon: "account-group-outline",
    route: "/customers",
    visible: always,
  },
  {
    id: "promotions",
    label: "Promotions & vouchers",
    description: "Offers, voucher codes and promotion lifecycle.",
    labelKey: "section.promotions.label",
    descriptionKey: "section.promotions.desc",
    icon: "ticket-percent-outline",
    route: "/promotions",
    visible: (context) => promotionCapabilities(context).canRead,
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Supplier records and receiving history.",
    labelKey: "section.suppliers.label",
    descriptionKey: "section.suppliers.desc",
    icon: "truck-outline",
    route: "/suppliers",
    visible: (context) => context.access.suppliers?.canRead === true,
  },
  {
    id: "staff",
    label: "Staff",
    description: "Memberships, roles and access scopes.",
    labelKey: "section.staff.label",
    descriptionKey: "section.staff.desc",
    icon: "badge-account-horizontal-outline",
    route: "/staff",
    visible: (context) => staffCapabilities(context).canRead,
  },
  {
    id: "attendance",
    label: "Attendance & payroll",
    description: "Clock-ins, leave, payroll and compensation.",
    labelKey: "section.attendance.label",
    descriptionKey: "section.attendance.desc",
    icon: "clock-outline",
    route: "/attendance",
    visible: (context) => attendanceCapabilities(context).canRead,
  },
  {
    id: "reports",
    label: "Reports",
    description: "Sales, products, inventory, returns and supplier reporting.",
    labelKey: "section.reports.label",
    descriptionKey: "section.reports.desc",
    icon: "chart-box-outline",
    route: "/reports",
    visible: (context) => reportingCapabilities(context).canRead,
  },
  {
    id: "activity",
    label: "Activity",
    description: "Awaiting a canonical management audit-log API.",
    labelKey: "section.activity.label",
    descriptionKey: "section.activity.desc",
    icon: "history",
    status: "planned",
    visible: always,
  },
  {
    id: "settings",
    label: "Settings",
    description: "Business, locations, registers, policies and devices.",
    labelKey: "section.settings.label",
    descriptionKey: "section.settings.desc",
    icon: "cog-outline",
    route: "/settings",
    visible: (context) => settingsCapabilities(context).canRead,
  },
  {
    id: "storefront",
    label: "Storefront",
    description: "Checkout settings, catalog publication and website controls.",
    labelKey: "section.storefront.label",
    descriptionKey: "section.storefront.desc",
    icon: "storefront-outline",
    route: "/storefront",
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

/**
 * The sections promoted to the persistent bottom navigation. This is the single source of truth for
 * "which sections are primary"; the bottom bar renders them (in nav order) and the More screen omits
 * them so a section is never both a tab and a More row.
 */
export const PRIMARY_SECTION_IDS = [
  "dashboard",
  "orders",
  "inventory",
  "products",
] as const satisfies readonly ManagementSectionId[];

export function isPrimarySection(id: ManagementSectionId): boolean {
  return (PRIMARY_SECTION_IDS as readonly ManagementSectionId[]).includes(id);
}

/**
 * Resolve which primary tab owns the current path, derived from the section registry's own routes
 * rather than a hand-maintained prefix list. Anything not under a primary route belongs to "More".
 */
export function activeSectionForPath(pathname: string): ManagementSectionId | "more" {
  for (const id of PRIMARY_SECTION_IDS) {
    const route = managementSection(id).route;
    if (!route) continue;
    if (route === "/") {
      if (pathname === "/") return id;
      continue;
    }
    if (pathname === route || pathname.startsWith(`${route}/`)) return id;
  }
  return "more";
}

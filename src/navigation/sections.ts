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
  | "categories"
  | "orders"
  | "inventory"
  | "customers"
  | "promotions"
  | "suppliers"
  | "staff"
  | "attendance"
  | "reports"
  | "settings"
  | "storefront"
  | "syncConflicts";

export type ManagementRoute =
  | "/"
  | "/products"
  | "/collections"
  | "/categories"
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
  | "/sync-conflicts"
  | "/more";

/**
 * Thematic buckets the non-primary sections are grouped under on the More screen, so a long flat list
 * becomes a scannable, structured directory. Order here is the display order of the groups.
 */
export type SectionGroup = "selling" | "catalog" | "purchasing" | "team" | "insights" | "business";

export const SECTION_GROUP_ORDER: readonly SectionGroup[] = [
  "selling",
  "catalog",
  "purchasing",
  "team",
  "insights",
  "business",
] as const;

export const SECTION_GROUP_LABEL_KEYS: Record<
  SectionGroup,
  { labelKey: MessageKey; icon: AppIconName }
> = {
  selling: { labelKey: "more.group.selling", icon: "storefront-outline" },
  catalog: { labelKey: "more.group.catalog", icon: "tag-multiple-outline" },
  purchasing: { labelKey: "more.group.purchasing", icon: "truck-outline" },
  team: { labelKey: "more.group.team", icon: "account-group-outline" },
  insights: { labelKey: "more.group.insights", icon: "chart-box-outline" },
  business: { labelKey: "more.group.business", icon: "cog-outline" },
};

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
  /** Which More-screen group this section belongs to. Primary (bottom-tab) sections omit it. */
  group?: SectionGroup;
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
    group: "catalog",
    visible: (context) => context.access.catalog.canRead,
  },
  {
    id: "categories",
    label: "Categories",
    description: "Website menu: Men, Women and product types.",
    labelKey: "section.categories.label",
    descriptionKey: "section.categories.desc",
    icon: "file-tree-outline",
    route: "/categories",
    group: "catalog",
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
    group: "selling",
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
    group: "selling",
    visible: (context) => promotionCapabilities(context).canRead,
  },
  {
    id: "storefront",
    label: "Storefront",
    description: "Checkout settings, catalog publication and website controls.",
    labelKey: "section.storefront.label",
    descriptionKey: "section.storefront.desc",
    icon: "storefront-outline",
    route: "/storefront",
    group: "selling",
    visible: always,
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Supplier records and receiving history.",
    labelKey: "section.suppliers.label",
    descriptionKey: "section.suppliers.desc",
    icon: "truck-outline",
    route: "/suppliers",
    group: "purchasing",
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
    group: "team",
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
    group: "team",
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
    group: "insights",
    visible: (context) => reportingCapabilities(context).canRead,
  },
  {
    // ADR-042 §13.5: post-sync conflicts of bounded emergency-offline POS operation (report only).
    id: "syncConflicts",
    label: "Sync conflicts",
    description:
      "Stock, debt, customer and attendance conflicts found when tills synced offline work.",
    labelKey: "section.syncConflicts.label",
    descriptionKey: "section.syncConflicts.desc",
    icon: "sync-alert",
    route: "/sync-conflicts",
    group: "insights",
    visible: (context) => context.access.orders.canRead && context.access.orders.tenantWide,
  },
  {
    id: "settings",
    label: "Settings",
    description: "Business, locations, registers, policies and devices.",
    labelKey: "section.settings.label",
    descriptionKey: "section.settings.desc",
    icon: "cog-outline",
    route: "/settings",
    group: "business",
    visible: (context) => settingsCapabilities(context).canRead,
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

export interface SectionGroupBucket {
  group: SectionGroup;
  sections: readonly ManagementSection[];
}

/**
 * Visible, non-primary sections organised into their display groups (in {@link SECTION_GROUP_ORDER}),
 * so the More screen renders a structured directory rather than one flat list. Groups with no visible
 * sections are omitted. A section missing a `group` (should not happen for non-primary) falls into
 * "business" so it is never silently dropped.
 */
export function groupedManagementSections(context: MeContextResponse): SectionGroupBucket[] {
  const visible = visibleManagementSections(context).filter(
    // Route-less (planned/contract-pending) sections are surfaced separately, never as a tappable row.
    (section) => !isPrimarySection(section.id) && section.route,
  );
  return SECTION_GROUP_ORDER.map((group) => ({
    group,
    sections: visible.filter((section) => (section.group ?? "business") === group),
  })).filter((bucket) => bucket.sections.length > 0);
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

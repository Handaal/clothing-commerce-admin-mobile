import { StyleSheet, View } from "react-native";

import { useI18n } from "../i18n";
import { promotionCapabilities } from "../promotions/capabilities";
import { reportingCapabilities } from "../reporting/capabilities";
import { staffCapabilities } from "../staff/capabilities";
import { InfoRow, SectionHeading } from "../ui/components";
import { colors, radius, spacing } from "../ui/theme";
import { settingsCapabilities } from "./capabilities";
import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

/**
 * Read-only summary of what the current admin can read/manage, shown exactly as the server returned
 * it. Capability flags guide navigation only; the Commerce API still authorizes every request.
 */
export function AccessSummary({ context }: { context: MeContextResponse }) {
  const { access } = context;
  const { t } = useI18n();
  const staff = staffCapabilities(context);
  const promotions = promotionCapabilities(context);
  const reports = reportingCapabilities(context);
  const settings = settingsCapabilities(context);
  return (
    <>
      <SectionHeading title={t("home.yourAccess")} detail={t("common.serverAuthoritative")} />
      <View style={styles.accessPanel}>
        <InfoRow
          label={t("home.access.catalog")}
          value={describeAccess(
            t,
            access.catalog.canRead,
            access.catalog.tenantWide,
            access.catalog.brands.length,
            "brands",
          )}
        />
        <InfoRow
          label={t("home.access.inventory")}
          value={describeAccess(
            t,
            access.inventory.canRead,
            access.inventory.tenantWide,
            access.inventory.locations.length,
            "locations",
          )}
        />
        <InfoRow
          label={t("home.access.orders")}
          value={describeAccess(
            t,
            access.orders.canRead,
            access.orders.tenantWide,
            access.orders.brands.length,
            "brands",
          )}
        />
        <InfoRow
          label={t("home.access.suppliers")}
          value={describeReadManage(t, access.suppliers?.canRead === true, access.suppliers?.canManage === true)}
        />
        <InfoRow label={t("home.access.staff")} value={describeReadManage(t, staff.canRead, staff.canManage)} />
        <InfoRow
          label={t("home.access.promotions")}
          value={describeReadManage(t, promotions.canRead, promotions.canManage)}
        />
        <InfoRow
          label={t("home.access.reporting")}
          value={reports.canRead ? t("home.access.read") : t("home.access.noRead")}
        />
        <InfoRow
          label={t("home.access.settings")}
          value={describeReadManage(t, settings.canRead, settings.canManage)}
        />
      </View>
    </>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

function describeAccess(
  t: Translate,
  canRead: boolean,
  tenantWide: boolean,
  scopeCount: number,
  scope: "brands" | "locations",
): string {
  if (!canRead) return t("home.access.noRead");
  if (tenantWide) return t("home.access.readTenantWide");
  return t("home.access.readScoped", {
    count: scopeCount,
    scope: scope === "brands" ? t("home.scope.brands") : t("home.scope.locations"),
  });
}

function describeReadManage(t: Translate, canRead: boolean, canManage: boolean): string {
  if (!canRead) return t("home.access.noRead");
  return canManage ? t("home.access.readManage") : t("home.access.read");
}

const styles = StyleSheet.create({
  accessPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
});

import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { classifyCommerceError } from "../src/commerce/errors";
import { HomeOperationalFocus } from "../src/home/HomeOperationalFocus";
import { OwnerOverview } from "../src/home/OwnerOverview";
import { directionalIcon, useI18n } from "../src/i18n";
import {
  isPrimarySection,
  visibleManagementSections,
  type ManagementSection,
} from "../src/navigation/sections";
import { resolveReportingAdapter } from "../src/reporting/adapter";
import { reportingCapabilities } from "../src/reporting/capabilities";
import { useSession } from "../src/session/SessionProvider";
import { resolveSupplierAdapter } from "../src/suppliers/adapter";
import { tenantDisplayName } from "../src/tenant/presentation";
import {
  Body,
  Divider,
  Eyebrow,
  LoadingBlock,
  PrimaryButton,
  Screen,
  ScrollScreen,
  SectionHeading,
  TextButton,
  Title,
  webLift,
} from "../src/ui/components";
import { AppIcon } from "../src/ui/Icon";
import { SignInScreen } from "../src/ui/SignInScreen";
import { colors, fonts, radius, shadows, spacing } from "../src/ui/theme";
import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import type { TenantMembership } from "../src/tenant/selection";

// Authentication and tenant bootstrap terminate in the capability-aware management dashboard.
export default function HomeScreen() {
  const { state } = useSession();
  const { t } = useI18n();

  switch (state.phase) {
    case "initializing":
      return (
        <Frame>
          <LoadingBlock label={t("home.startingClerk")} />
        </Frame>
      );
    case "signed-out":
      return <SignInScreen />;
    case "bootstrapping":
      return (
        <Frame>
          <LoadingBlock label={t("home.loadingBusinesses")} />
        </Frame>
      );
    case "no-access":
      return <NoAccessScreen />;
    case "choosing":
      return <TenantSelectorScreen tenants={state.tenants} />;
    case "loading-context":
      return (
        <Frame>
          <LoadingBlock label={t("home.loadingContext")} />
        </Frame>
      );
    case "ready":
      return <ReadyScreen tenantId={state.tenantId} context={state.context} />;
    case "error":
      return <ErrorScreen kind={state.error.kind} message={state.error.message} />;
  }
}

function Frame({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <Screen>
      <StatusBar style="dark" />
      <Eyebrow>{t("home.authChannel")}</Eyebrow>
      {children}
    </Screen>
  );
}

function SignOutButton() {
  const { signOut } = useSession();
  const { t } = useI18n();
  return <TextButton label={t("common.signOut")} icon="logout" onPress={() => void signOut()} />;
}

function NoAccessScreen() {
  const { t } = useI18n();
  return (
    <Frame>
      <Title>{t("home.noActiveTitle")}</Title>
      <Body>{t("home.noActiveBody")}</Body>
      <Divider />
      <SignOutButton />
    </Frame>
  );
}

function TenantSelectorScreen({ tenants }: { tenants: TenantMembership[] }) {
  const { selectTenant } = useSession();
  const { t } = useI18n();
  return (
    <Frame>
      <Title>{t("home.chooseTitle")}</Title>
      <Body>{t("home.chooseBody")}</Body>
      <Divider />
      {tenants.map((tenant) => (
        <PrimaryButton
          key={tenant.tenantId}
          testID={`tenant-${tenant.tenantId}`}
          label={tenantDisplayName(tenant.tenantName)}
          onPress={() => selectTenant(tenant.tenantId)}
        />
      ))}
      <Divider />
      <SignOutButton />
    </Frame>
  );
}

function ReadyScreen({ tenantId, context }: { tenantId: string; context: MeContextResponse }) {
  const router = useRouter();
  const { getTenantClient } = useSession();
  const { t, isRTL } = useI18n();
  const client = getTenantClient(tenantId);
  const reportAccess = reportingCapabilities(context);
  const reportingAdapter = reportAccess.canRead ? resolveReportingAdapter(client) : null;
  const supplierAdapter = context.access.suppliers?.canRead ? resolveSupplierAdapter(client) : null;
  const quickSections = visibleManagementSections(context).filter(
    (section) =>
      section.route &&
      !isPrimarySection(section.id) &&
      !["dashboard", "customers", "activity", "storefront"].includes(section.id),
  );
  return (
    <ScrollScreen wide>
      <StatusBar style="dark" />
      <DashboardHero
        tenantName={tenantDisplayName(context.tenant.name)}
        status={context.tenant.status}
        isRTL={isRTL}
      />

      {reportingAdapter ? (
        <OwnerOverview
          adapter={reportingAdapter}
          onOpenReports={() => router.push("/reports")}
          onOpenProductsReport={() => router.push("/reports/products")}
          onOpenReturnsReport={() => router.push("/reports/returns")}
        />
      ) : null}

      <HomeOperationalFocus
        client={client}
        canReadOrders={context.access.orders.canRead}
        canReadInventory={context.access.inventory.canRead}
        supplierAdapter={supplierAdapter}
        onOpenOrder={(orderId) => router.push(`/orders/${orderId}`)}
        onOpenOrders={() => router.push("/orders")}
        onOpenInventory={() => router.push("/inventory")}
        onOpenSupplier={(supplierId) => router.push(`/suppliers/${supplierId}`)}
        onOpenSuppliers={() => router.push("/suppliers")}
      />

      <SectionHeading
        title={t("home.managementAreas")}
        detail={t("home.available", { count: quickSections.length })}
      />
      <View style={dashboardStyles.moduleGrid}>
        {quickSections.map((section) => (
          <DashboardCard
            key={section.id}
            section={section}
            testID={`open-${section.id}`}
            onPress={() => router.push(section.route!)}
          />
        ))}
      </View>

      <Pressable
        testID="open-storefront"
        accessibilityRole="button"
        onPress={() => router.push("/storefront")}
        {...webLift}
        style={({ pressed }) => [dashboardStyles.storefront, pressed && dashboardStyles.pressed]}
      >
        <View style={dashboardStyles.storefrontIcon}>
          <AppIcon name="storefront-outline" size={25} color={colors.accent} />
        </View>
        <View style={dashboardStyles.storefrontCopy}>
          <Text style={dashboardStyles.storefrontTitle}>{t("home.storefront")}</Text>
          <Text style={dashboardStyles.storefrontBody}>{t("home.storefrontBody")}</Text>
        </View>
        <AppIcon name={directionalIcon("arrow-right", isRTL)} size={21} color={colors.accent} />
      </Pressable>

      <PrimaryButton
        testID="open-more"
        label={t("home.allSections")}
        icon="dots-grid"
        variant="secondary"
        onPress={() => router.push("/more")}
      />

      <SignOutButton />
    </ScrollScreen>
  );
}

function DashboardHero({
  tenantName,
  status,
  isRTL,
}: {
  tenantName: string;
  status: string;
  isRTL: boolean;
}) {
  const { t } = useI18n();
  const initial = tenantName.trim().slice(0, 1).toUpperCase() || "•";

  return (
    <View style={dashboardStyles.heroStage} testID="home-hero">
      <View style={dashboardStyles.heroShadow}>
        <View style={dashboardStyles.hero}>
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={dashboardStyles.heroHalo}
          />
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={dashboardStyles.heroOrb}
          />
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={dashboardStyles.heroSlash}
          />
          <Text
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={[dashboardStyles.heroWatermark, isRTL && dashboardStyles.heroWatermarkRTL]}
          >
            {initial}
          </Text>

          <View style={dashboardStyles.heroTopRow}>
            <View style={dashboardStyles.heroKicker}>
              <View style={dashboardStyles.heroKickerMark} />
              <Text style={dashboardStyles.heroEyebrow}>{t("home.workspace")}</Text>
            </View>
            <View style={dashboardStyles.heroStatus}>
              <View style={dashboardStyles.statusDot} />
              <Text style={dashboardStyles.heroStatusText}>{status}</Text>
            </View>
          </View>

          <View style={dashboardStyles.heroCopy}>
            <Text numberOfLines={2} style={dashboardStyles.heroTitle}>
              {tenantName}
            </Text>
            <Text numberOfLines={2} style={dashboardStyles.heroBody}>
              {t("home.ownerWorkspaceBody")}
            </Text>
          </View>

          <View style={dashboardStyles.heroRule}>
            <View style={dashboardStyles.heroRuleLine} />
            <View style={dashboardStyles.heroRuleDot} />
            <View style={dashboardStyles.heroRuleDot} />
            <View style={dashboardStyles.heroRuleDot} />
          </View>
        </View>
      </View>

      <View
        style={[dashboardStyles.heroSeal, isRTL && dashboardStyles.heroSealRTL]}
        accessibilityLabel={tenantName}
      >
        <View style={dashboardStyles.heroSealInner}>
          <Text style={dashboardStyles.heroInitial}>{initial}</Text>
        </View>
      </View>
      <View style={[dashboardStyles.heroTab, isRTL && dashboardStyles.heroTabRTL]}>
        <AppIcon name="chart-box-outline" size={20} color={colors.white} />
      </View>
    </View>
  );
}

function DashboardCard({
  section,
  testID,
  onPress,
}: {
  section: ManagementSection;
  testID: string;
  onPress: () => void;
}) {
  const { t, isRTL } = useI18n();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      {...webLift}
      style={({ pressed }) => [dashboardStyles.moduleCard, pressed && dashboardStyles.pressed]}
    >
      <View style={dashboardStyles.moduleIcon}>
        <AppIcon name={section.icon} size={23} color={colors.brand} />
      </View>
      <Text style={dashboardStyles.moduleTitle}>{t(section.labelKey)}</Text>
      <Text numberOfLines={2} style={dashboardStyles.moduleBody}>
        {t(section.descriptionKey)}
      </Text>
      <AppIcon name={directionalIcon("arrow-up-right", isRTL)} size={18} color={colors.inkSubtle} />
    </Pressable>
  );
}

const dashboardStyles = StyleSheet.create({
  heroStage: {
    position: "relative",
    paddingTop: 8,
    paddingBottom: 20,
  },
  heroShadow: {
    borderTopLeftRadius: 34,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 34,
    borderBottomLeftRadius: 10,
    ...shadows.raised,
  },
  hero: {
    minHeight: 192,
    position: "relative",
    overflow: "hidden",
    justifyContent: "space-between",
    borderTopLeftRadius: 34,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 34,
    borderBottomLeftRadius: 10,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: 36,
    gap: spacing.lg,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandStrong,
  },
  heroHalo: {
    position: "absolute",
    width: 250,
    height: 250,
    top: -145,
    right: -70,
    borderRadius: 999,
    borderWidth: 42,
    borderColor: colors.onBrandVeil,
  },
  heroOrb: {
    position: "absolute",
    width: 88,
    height: 88,
    right: 56,
    bottom: -54,
    borderRadius: 999,
    backgroundColor: colors.accent,
    opacity: 0.75,
  },
  heroSlash: {
    position: "absolute",
    width: 260,
    height: 1,
    top: 88,
    right: -46,
    backgroundColor: colors.onBrandVeilStrong,
    transform: [{ rotate: "-24deg" }],
  },
  heroWatermark: {
    position: "absolute",
    right: 20,
    bottom: -30,
    color: colors.onBrandVeil,
    fontFamily: fonts.serif,
    fontSize: 152,
    lineHeight: 164,
    fontWeight: "700",
  },
  heroWatermarkRTL: { right: undefined, left: 20 },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  heroKicker: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  heroKickerMark: {
    width: 22,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  heroCopy: { maxWidth: 560, gap: spacing.sm, zIndex: 1 },
  heroSeal: {
    position: "absolute",
    left: 22,
    bottom: 0,
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    borderWidth: 5,
    borderColor: colors.canvas,
    backgroundColor: colors.accent,
    transform: [{ rotate: "-7deg" }],
    ...shadows.card,
  },
  heroSealRTL: { left: undefined, right: 22, transform: [{ rotate: "7deg" }] },
  heroSealInner: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.42)",
  },
  heroInitial: { color: colors.white, fontFamily: fonts.serif, fontSize: 22, fontWeight: "700" },
  heroEyebrow: {
    color: colors.onBrandDim,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.35,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: colors.white,
    fontFamily: fonts.displaySans,
    fontSize: 31,
    lineHeight: 37,
    fontWeight: "800",
    letterSpacing: -0.85,
    maxWidth: "78%",
  },
  heroBody: {
    maxWidth: 430,
    color: colors.onBrandDim,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  heroStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.onBrandVeilStrong,
  },
  statusDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: "#7BD3A4" },
  heroStatusText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  heroRule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingEnd: 72,
  },
  heroRuleLine: { width: 52, height: 1, backgroundColor: colors.onBrandVeilStrong },
  heroRuleDot: { width: 3, height: 3, borderRadius: radius.pill, backgroundColor: colors.accent },
  heroTab: {
    position: "absolute",
    top: 0,
    right: 18,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 4,
    borderColor: colors.canvas,
    backgroundColor: colors.accent,
    transform: [{ rotate: "5deg" }],
  },
  heroTabRTL: { right: undefined, left: 18, transform: [{ rotate: "-5deg" }] },
  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  moduleCard: {
    flexGrow: 1,
    flexBasis: "46%",
    minHeight: 148,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  moduleIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  moduleTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  moduleBody: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, fontWeight: "500", flex: 1 },
  storefront: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: "#EAD4CC",
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.accentSoft,
    ...shadows.card,
  },
  storefrontIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#EAD4CC",
  },
  storefrontCopy: { flex: 1, gap: 3 },
  storefrontTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  storefrontBody: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});

function ErrorScreen({
  kind,
  message,
}: {
  kind: ReturnType<typeof classifyCommerceError>["kind"];
  message: string;
}) {
  const { reload, signOut } = useSession();
  const { t } = useI18n();
  const heading =
    kind === "auth"
      ? t("error.sessionProblem")
      : kind === "forbidden"
        ? t("error.accessDenied")
        : kind === "network"
          ? t("error.cannotReachApi")
          : t("error.somethingWrong");
  return (
    <Frame>
      <Title>{heading}</Title>
      <Body>{message}</Body>
      <Divider />
      {kind === "auth" ? null : <PrimaryButton label={t("common.tryAgain")} onPress={reload} />}
      <TextButton label={t("common.signOut")} onPress={() => void signOut()} />
    </Frame>
  );
}

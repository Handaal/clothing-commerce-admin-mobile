import { useRouter } from "expo-router";
import { ThemedStatusBar } from "../src/ui/ThemedStatusBar";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { classifyCommerceError } from "../src/commerce/errors";
import { HomeOperationalFocus } from "../src/home/HomeOperationalFocus";
import { OwnerOverview } from "../src/home/OwnerOverview";
import { directionalIcon, useI18n } from "../src/i18n";
import { resolveReportingAdapter } from "../src/reporting/adapter";
import { promotionCapabilities } from "../src/promotions/capabilities";
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
  webLiftRise,
  webRise,
} from "../src/ui/components";
import { useDismissibleHint } from "../src/ui/hints";
import { AppIcon, type AppIconName } from "../src/ui/Icon";
import { SignInScreen } from "../src/ui/SignInScreen";
import { fonts, radius, shadows, spacing, typography } from "../src/ui/theme";
import { createThemedStyles } from "../src/ui/useTheme";
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
      <ThemedStatusBar />
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
  const { dashboardStyles } = useStyles();
  const router = useRouter();
  const { getTenantClient } = useSession();
  const { t } = useI18n();
  const client = getTenantClient(tenantId);
  const reportAccess = reportingCapabilities(context);
  const reportingAdapter = reportAccess.canRead ? resolveReportingAdapter(client) : null;
  const supplierAdapter = context.access.suppliers?.canRead ? resolveSupplierAdapter(client) : null;

  // The three things an owner most often starts from Home. Each appears only when the account can
  // actually do it (guidance only — the service still checks every action).
  const quickActions: QuickAction[] = [];
  if (context.access.inventory.write.canReceive && context.access.catalog.canRead) {
    quickActions.push({
      id: "receive",
      label: t("home.qaReceive"),
      detail: t("home.qaReceiveDetail"),
      icon: "package-variant-plus",
      onPress: () => router.push("/inventory/receive"),
    });
  }
  if (promotionCapabilities(context).canManage) {
    quickActions.push({
      id: "promotion",
      label: t("home.qaPromotion"),
      detail: t("home.qaPromotionDetail"),
      icon: "ticket-percent-outline",
      onPress: () => router.push("/promotions/new"),
    });
  }
  if (reportAccess.canRead) {
    quickActions.push({
      id: "reports",
      label: t("home.qaReports"),
      detail: t("home.qaReportsDetail"),
      icon: "chart-box-outline",
      onPress: () => router.push("/reports"),
    });
  }

  return (
    <ScrollScreen wide>
      <ThemedStatusBar />
      <DashboardHero tenantName={tenantDisplayName(context.tenant.name)} />

      <OnboardingCard />

      {/* 1. Today at a glance */}
      {reportingAdapter ? (
        <OwnerOverview
          adapter={reportingAdapter}
          onOpenReports={() => router.push("/reports")}
          onOpenProductsReport={() => router.push("/reports/products")}
          onOpenReturnsReport={() => router.push("/reports/returns")}
        />
      ) : null}

      {/* 2. Needs attention */}
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

      {/* 3. Quick actions. Everything else lives in the bottom tabs and the More screen. */}
      {quickActions.length > 0 ? (
        <>
          <SectionHeading title={t("home.quickActions")} />
          <View style={dashboardStyles.quickActions}>
            {quickActions.map((action, index) => (
              <QuickActionCard key={action.id} action={action} riseIndex={index + 1} />
            ))}
          </View>
        </>
      ) : null}
    </ScrollScreen>
  );
}

interface QuickAction {
  id: string;
  label: string;
  detail: string;
  icon: AppIconName;
  onPress: () => void;
}

function QuickActionCard({ action, riseIndex }: { action: QuickAction; riseIndex: number }) {
  const { dashboardStyles, colors } = useStyles();
  const { isRTL } = useI18n();
  return (
    <Pressable
      testID={`quick-${action.id}`}
      accessibilityRole="button"
      accessibilityHint={action.detail}
      onPress={action.onPress}
      {...webLiftRise(riseIndex)}
      style={({ pressed }) => [dashboardStyles.quickAction, pressed && dashboardStyles.pressed]}
    >
      <View style={dashboardStyles.quickActionIcon}>
        <AppIcon name={action.icon} size={22} color={colors.brand} />
      </View>
      <View style={dashboardStyles.quickActionCopy}>
        <Text numberOfLines={1} style={dashboardStyles.quickActionTitle}>
          {action.label}
        </Text>
      </View>
      <AppIcon name={directionalIcon("chevron-right", isRTL)} size={20} color={colors.inkSubtle} />
    </Pressable>
  );
}

function DashboardHero({ tenantName }: { tenantName: string }) {
  const { dashboardStyles } = useStyles();
  const { t, isRTL } = useI18n();
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
    </View>
  );
}

function OnboardingCard() {
  const { dashboardStyles, colors } = useStyles();
  const { t } = useI18n();
  const { visible, dismiss } = useDismissibleHint("home-welcome");
  if (!visible) return null;
  return (
    <View testID="home-onboarding" style={dashboardStyles.onboarding} {...webRise(1)}>
      <View style={dashboardStyles.onboardingIcon}>
        <AppIcon name="lightbulb-on-outline" size={22} color={colors.accent} />
      </View>
      <View style={dashboardStyles.onboardingCopy}>
        <Text style={dashboardStyles.onboardingEyebrow}>{t("home.onboardingEyebrow")}</Text>
        <Text style={dashboardStyles.onboardingTitle}>{t("home.onboardingTitle")}</Text>
        <Text style={dashboardStyles.onboardingBody}>{t("home.onboardingBody")}</Text>
        <TextButton
          testID="home-onboarding-dismiss"
          label={t("home.onboardingDismiss")}
          icon="check"
          onPress={dismiss}
        />
      </View>
    </View>
  );
}

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

const useStyles = createThemedStyles((colors) => {
  const dashboardStyles = StyleSheet.create({
    quickActions: { gap: spacing.sm },
    quickAction: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    quickActionIcon: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: colors.brandSoft,
    },
    quickActionCopy: { flex: 1, minWidth: 0, gap: 2 },
    quickActionTitle: { color: colors.ink, ...typography.cardTitle },
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
      // Intentionally the always-dark brand surface so the hero stays a premium deep-forest showcase in
      // both light and dark themes (its white-on-brand content never inverts).
      backgroundColor: colors.brandFixed,
      borderWidth: 1,
      borderColor: colors.brandFixed,
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
    heroInitial: {
      color: colors.white,
      ...typography.title,
      fontFamily: fonts.serif,
      fontWeight: "700",
    },
    heroEyebrow: {
      color: colors.onBrandDim,
      ...typography.micro,
      fontWeight: "800",
      letterSpacing: 1.35,
      textTransform: "uppercase",
    },
    heroTitle: {
      color: colors.white,
      ...typography.display,
      maxWidth: "78%",
    },
    heroBody: {
      maxWidth: 430,
      color: colors.onBrandDim,
      ...typography.label,
      fontWeight: "600",
    },
    heroRule: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingEnd: 72,
    },
    heroRuleLine: { width: 52, height: 1, backgroundColor: colors.onBrandVeilStrong },
    heroRuleDot: { width: 3, height: 3, borderRadius: radius.pill, backgroundColor: colors.accent },
    onboarding: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      borderRadius: radius.lg,
      padding: spacing.lg,
      backgroundColor: colors.accentSoft,
      ...shadows.card,
    },
    onboardingIcon: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    onboardingCopy: { flex: 1, gap: spacing.xs },
    onboardingEyebrow: {
      color: colors.accent,
      ...typography.micro,
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    onboardingTitle: { color: colors.ink, ...typography.subtitle },
    onboardingBody: { color: colors.inkMuted, ...typography.label, fontWeight: "500" },
    pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  });
  return { colors, dashboardStyles };
});

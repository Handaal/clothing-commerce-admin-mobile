import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { classifyCommerceError } from "../src/commerce/errors";
import { visibleManagementSections, type ManagementSection } from "../src/navigation/sections";
import { promotionCapabilities } from "../src/promotions/capabilities";
import { reportingCapabilities } from "../src/reporting/capabilities";
import { settingsCapabilities } from "../src/settings/capabilities";
import { useSession } from "../src/session/SessionProvider";
import { staffCapabilities } from "../src/staff/capabilities";
import {
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  PrimaryButton,
  Screen,
  ScrollScreen,
  SectionHeading,
  TextButton,
  Title,
} from "../src/ui/components";
import { AppIcon } from "../src/ui/Icon";
import { SignInScreen } from "../src/ui/SignInScreen";
import { colors, radius, shadows, spacing } from "../src/ui/theme";
import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import type { TenantMembership } from "../src/tenant/selection";

// Authentication and tenant bootstrap terminate in the capability-aware management dashboard.
export default function HomeScreen() {
  const { state } = useSession();

  switch (state.phase) {
    case "initializing":
      return (
        <Frame>
          <LoadingBlock label="Starting Clerk…" />
        </Frame>
      );
    case "signed-out":
      return <SignInScreen />;
    case "bootstrapping":
      return (
        <Frame>
          <LoadingBlock label="Loading your businesses…" />
        </Frame>
      );
    case "no-access":
      return <NoAccessScreen />;
    case "choosing":
      return <TenantSelectorScreen tenants={state.tenants} />;
    case "loading-context":
      return (
        <Frame>
          <LoadingBlock label="Loading management context…" />
        </Frame>
      );
    case "ready":
      return <ReadyScreen context={state.context} />;
    case "error":
      return <ErrorScreen kind={state.error.kind} message={state.error.message} />;
  }
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Screen>
      <StatusBar style="dark" />
      <Eyebrow>Authorized management channel</Eyebrow>
      {children}
    </Screen>
  );
}

function SignOutButton() {
  const { signOut } = useSession();
  return <TextButton label="Sign out" icon="logout" onPress={() => void signOut()} />;
}

function NoAccessScreen() {
  return (
    <Frame>
      <Title>No active business</Title>
      <Body>
        You are signed in, but your account is not a member of any active business. Ask an owner or
        administrator to grant you access, then sign in again.
      </Body>
      <Divider />
      <SignOutButton />
    </Frame>
  );
}

function TenantSelectorScreen({ tenants }: { tenants: TenantMembership[] }) {
  const { selectTenant } = useSession();
  return (
    <Frame>
      <Title>Choose a business</Title>
      <Body>Your account manages more than one business. Select one to continue.</Body>
      <Divider />
      {tenants.map((tenant) => (
        <PrimaryButton
          key={tenant.tenantId}
          testID={`tenant-${tenant.tenantId}`}
          label={tenant.tenantName}
          onPress={() => selectTenant(tenant.tenantId)}
        />
      ))}
      <Divider />
      <SignOutButton />
    </Frame>
  );
}

function ReadyScreen({ context }: { context: MeContextResponse }) {
  // Access flags below are shown exactly as the server returned them. They guide navigation only;
  // the client never infers permissions or grants "owner/manager = everything".
  const { access } = context;
  const router = useRouter();
  const staff = staffCapabilities(context);
  const promotions = promotionCapabilities(context);
  const reports = reportingCapabilities(context);
  const settings = settingsCapabilities(context);
  const quickSections = visibleManagementSections(context).filter(
    (section) =>
      section.route && !["dashboard", "customers", "activity", "storefront"].includes(section.id),
  );
  return (
    <ScrollScreen>
      <StatusBar style="dark" />
      <View style={dashboardStyles.hero}>
        <View style={dashboardStyles.heroIcon}>
          <AppIcon name="briefcase-variant-outline" size={24} color={colors.white} />
        </View>
        <Text style={dashboardStyles.heroEyebrow}>Management workspace</Text>
        <Text style={dashboardStyles.heroTitle}>{context.tenant.name}</Text>
        <View style={dashboardStyles.heroStatus}>
          <View style={dashboardStyles.statusDot} />
          <Text style={dashboardStyles.heroStatusText}>{context.tenant.status}</Text>
        </View>
      </View>

      <SectionHeading title="Quick access" detail={`${quickSections.length} available`} />
      <View style={dashboardStyles.grid}>
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
        style={({ pressed }) => [dashboardStyles.storefront, pressed && dashboardStyles.pressed]}
      >
        <View style={dashboardStyles.storefrontIcon}>
          <AppIcon name="storefront-outline" size={25} color={colors.accent} />
        </View>
        <View style={dashboardStyles.storefrontCopy}>
          <Text style={dashboardStyles.storefrontTitle}>Storefront</Text>
          <Text style={dashboardStyles.storefrontBody}>Website management workspace</Text>
        </View>
        <AppIcon name="arrow-right" size={21} color={colors.accent} />
      </Pressable>

      <PrimaryButton
        testID="open-more"
        label="All management sections"
        icon="dots-grid"
        variant="secondary"
        onPress={() => router.push("/more")}
      />

      <SectionHeading title="Your access" detail="Server-authoritative" />
      <View style={dashboardStyles.accessPanel}>
        <InfoRow
          label="Catalog"
          value={describeAccess(
            access.catalog.canRead,
            access.catalog.tenantWide,
            access.catalog.brands.length,
            "brands",
          )}
        />
        <InfoRow
          label="Inventory"
          value={describeAccess(
            access.inventory.canRead,
            access.inventory.tenantWide,
            access.inventory.locations.length,
            "locations",
          )}
        />
        <InfoRow
          label="Orders"
          value={describeAccess(
            access.orders.canRead,
            access.orders.tenantWide,
            access.orders.brands.length,
            "brands",
          )}
        />
        <InfoRow
          label="Suppliers"
          value={
            access.suppliers?.canRead
              ? access.suppliers.canManage
                ? "Read · manage"
                : "Read"
              : "No read access"
          }
        />
        <InfoRow
          label="Staff"
          value={staff.canRead ? (staff.canManage ? "Read · manage" : "Read") : "No read access"}
        />
        <InfoRow
          label="Promotions"
          value={
            promotions.canRead
              ? promotions.canManage
                ? "Read · manage"
                : "Read"
              : "No read access"
          }
        />
        <InfoRow label="Reporting" value={reports.canRead ? "Read" : "No read access"} />
        <InfoRow
          label="Settings"
          value={
            settings.canRead ? (settings.canManage ? "Read · manage" : "Read") : "No read access"
          }
        />
      </View>
      <SignOutButton />
    </ScrollScreen>
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
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [dashboardStyles.moduleCard, pressed && dashboardStyles.pressed]}
    >
      <View style={dashboardStyles.moduleIcon}>
        <AppIcon name={section.icon} size={23} color={colors.brand} />
      </View>
      <Text style={dashboardStyles.moduleTitle}>{section.label}</Text>
      <Text numberOfLines={2} style={dashboardStyles.moduleBody}>
        {section.description}
      </Text>
      <AppIcon name="arrow-up-right" size={18} color={colors.inkSubtle} />
    </Pressable>
  );
}

const dashboardStyles = StyleSheet.create({
  hero: {
    minHeight: 184,
    overflow: "hidden",
    borderRadius: radius.xl,
    padding: spacing.xxl,
    gap: spacing.sm,
    backgroundColor: colors.ink,
    ...shadows.card,
  },
  heroIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    marginBottom: spacing.sm,
  },
  heroEyebrow: {
    color: "#AEB4FF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  heroTitle: { color: colors.white, fontSize: 30, lineHeight: 36, fontWeight: "800" },
  heroStatus: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  statusDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: "#5EE7B7" },
  heroStatusText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  moduleCard: {
    flexGrow: 1,
    flexBasis: "46%",
    minHeight: 178,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  moduleIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    marginBottom: spacing.xs,
  },
  moduleTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  moduleBody: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, fontWeight: "500", flex: 1 },
  storefront: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: "#BFE4DE",
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.accentSoft,
  },
  storefrontIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  storefrontCopy: { flex: 1, gap: 3 },
  storefrontTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  storefrontBody: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  accessPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});

function describeAccess(
  canRead: boolean,
  tenantWide: boolean,
  scopeCount: number,
  scopeLabel: string,
): string {
  if (!canRead) return "No read access";
  if (tenantWide) return "Read · tenant-wide";
  return `Read · ${scopeCount} ${scopeLabel}`;
}

function ErrorScreen({
  kind,
  message,
}: {
  kind: ReturnType<typeof classifyCommerceError>["kind"];
  message: string;
}) {
  const { reload, signOut } = useSession();
  const heading =
    kind === "auth"
      ? "Session problem"
      : kind === "forbidden"
        ? "Access denied"
        : kind === "network"
          ? "Cannot reach the Commerce API"
          : "Something went wrong";
  return (
    <Frame>
      <Title>{heading}</Title>
      <Body>{message}</Body>
      <Divider />
      {kind === "auth" ? null : <PrimaryButton label="Try again" onPress={reload} />}
      <TextButton label="Sign out" onPress={() => void signOut()} />
    </Frame>
  );
}

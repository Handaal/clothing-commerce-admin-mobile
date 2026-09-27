import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { classifyCommerceError } from "../src/commerce/errors";
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
  TextButton,
  Title,
} from "../src/ui/components";
import { SignInScreen } from "../src/ui/SignInScreen";
import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import type { TenantMembership } from "../src/tenant/selection";

// Checkpoint 1 UI. It proves the real boundary end-to-end and deliberately contains NO Products,
// Inventory, Orders, or dashboard screens.
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
      return <ReadyScreen tenantId={state.tenantId} context={state.context} />;
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
  return <TextButton label="Sign out" onPress={() => void signOut()} />;
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

function ReadyScreen({ tenantId, context }: { tenantId: string; context: MeContextResponse }) {
  // Displays only non-sensitive context returned by GET /api/v1/me/context, proving the real call
  // succeeded. Access flags below are shown exactly as the server returned them — the client never
  // infers permissions or grants "owner/manager = everything".
  const { access } = context;
  const router = useRouter();
  const staff = staffCapabilities(context);
  const promotions = promotionCapabilities(context);
  const reports = reportingCapabilities(context);
  const settings = settingsCapabilities(context);
  return (
    <Frame>
      <Title>{context.tenant.name}</Title>
      <Body>Management context loaded from the Commerce API.</Body>
      <Divider />
      <InfoRow label="Tenant status" value={context.tenant.status} />
      <InfoRow label="Tenant id" value={tenantId} />
      <InfoRow label="Membership id" value={context.membership.id} />
      <Divider />
      <Eyebrow>Server-authoritative access</Eyebrow>
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
          promotions.canRead ? (promotions.canManage ? "Read · manage" : "Read") : "No read access"
        }
      />
      <InfoRow label="Reporting" value={reports.canRead ? "Read" : "No read access"} />
      <InfoRow
        label="Settings"
        value={
          settings.canRead ? (settings.canManage ? "Read · manage" : "Read") : "No read access"
        }
      />
      <Divider />
      {access.catalog.canRead ? (
        <PrimaryButton
          testID="open-products"
          label="View products"
          onPress={() => router.push("/products")}
        />
      ) : null}
      {access.inventory.canRead ? (
        <PrimaryButton
          testID="open-inventory"
          label="View inventory"
          onPress={() => router.push("/inventory")}
        />
      ) : null}
      {access.orders.canRead ? (
        <PrimaryButton
          testID="open-orders"
          label="View orders"
          onPress={() => router.push("/orders")}
        />
      ) : null}
      {/* Suppliers navigation follows the server's supplier read capability from `/me/context`
          (optional — absent means no access). The API remains the sole authority for every read/write. */}
      {access.suppliers?.canRead ? (
        <PrimaryButton
          testID="open-suppliers"
          label="Manage suppliers"
          onPress={() => router.push("/suppliers")}
        />
      ) : null}
      {/* Staff navigation follows the server's staff read capability from `/me/context`, read via the
          single `staffCapabilities` seam (the final context DTO is not yet frozen). The API remains the
          sole authority for every read/write; the foundation screen shows an unavailable state until the
          Staff SDK is integrated. */}
      {staff.canRead ? (
        <PrimaryButton
          testID="open-staff"
          label="Manage staff"
          onPress={() => router.push("/staff")}
        />
      ) : null}
      {/* Promotion guidance is independent: canManage never implies canRead. Navigation follows only
          canRead; the API remains authoritative for every list/detail/write request. */}
      {promotions.canRead ? (
        <PrimaryButton
          testID="open-promotions"
          label="Manage Promotions"
          onPress={() => router.push("/promotions")}
        />
      ) : null}
      {/* Reporting capability is isolated until SDK 0.13.0 types it. Missing guidance denies access;
          the eventual API still authorizes every reporting request. */}
      {reports.canRead ? (
        <PrimaryButton
          testID="open-reports"
          label="View reports"
          onPress={() => router.push("/reports")}
        />
      ) : null}
      {/* Settings guidance is optional until SDK 0.14.0. Missing guidance is denied; the API remains
          authoritative for every eventual read and mutation. */}
      {settings.canRead ? (
        <PrimaryButton
          testID="open-settings"
          label="Open settings"
          onPress={() => router.push("/settings")}
        />
      ) : null}
      <SignOutButton />
    </Frame>
  );
}

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

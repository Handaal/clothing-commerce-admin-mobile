// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { meContext, TENANT_A } from "../test-support/fixtures";
import type { SessionState } from "../session/reducer";

const mocks = vi.hoisted(() => ({
  state: null as unknown as SessionState,
  pathname: "/",
  replace: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname,
}));
vi.mock("../session/SessionProvider", () => ({ useSession: () => ({ state: mocks.state }) }));

import { ManagementShell } from "./ManagementShell";

// react-native-web does not forward accessibilityState.selected to an aria attribute, so the active
// tab is identified by the brand-colored icon (colors.brand === #4F46E5 === rgb(79, 70, 229)) that
// ManagementShell renders only for the selected item.
function isActive(tab: HTMLElement): boolean {
  return tab.querySelector('[style*="rgb(79, 70, 229)"]') !== null;
}

function renderShell() {
  return render(
    <ManagementShell>
      <Text testID="screen-content">Screen</Text>
    </ManagementShell>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/";
  // Default: fully authorized, ready session.
  mocks.state = {
    phase: "ready",
    context: meContext(TENANT_A, { inventory: { canRead: true } }),
  } as SessionState;
});
afterEach(() => cleanup());

describe("ManagementShell", () => {
  it("renders only the children with no navigation until the session is ready", () => {
    mocks.state = { phase: "bootstrapping" } as SessionState;
    renderShell();
    expect(screen.getByTestId("screen-content")).toBeTruthy();
    expect(screen.queryByTestId("nav-dashboard")).toBeNull();
  });

  it("shows the primary tabs for a fully authorized session", () => {
    renderShell();
    expect(screen.getByTestId("nav-dashboard")).toBeTruthy();
    expect(screen.getByTestId("nav-orders")).toBeTruthy();
    expect(screen.getByTestId("nav-inventory")).toBeTruthy();
    expect(screen.getByTestId("nav-products")).toBeTruthy();
    expect(screen.getByTestId("nav-more")).toBeTruthy();
  });

  it("hides a tab whose read access the server did not grant, keeping Home and More", () => {
    mocks.state = {
      phase: "ready",
      context: meContext(TENANT_A, {
        inventory: { canRead: false },
        orders: { canRead: false },
        catalog: { canRead: false },
      }),
    } as SessionState;
    renderShell();
    expect(screen.queryByTestId("nav-orders")).toBeNull();
    expect(screen.queryByTestId("nav-inventory")).toBeNull();
    expect(screen.queryByTestId("nav-products")).toBeNull();
    expect(screen.getByTestId("nav-dashboard")).toBeTruthy();
    expect(screen.getByTestId("nav-more")).toBeTruthy();
  });

  it("navigates with replace (not push) so the tab bar never stacks history", () => {
    renderShell();
    fireEvent.click(screen.getByTestId("nav-orders"));
    expect(mocks.replace).toHaveBeenCalledWith("/orders");
  });

  it("marks the tab matching the current path as selected", () => {
    mocks.pathname = "/orders/abc-123";
    renderShell();
    expect(isActive(screen.getByTestId("nav-orders"))).toBe(true);
    expect(isActive(screen.getByTestId("nav-dashboard"))).toBe(false);
  });

  it("treats any unrecognized authorized path as the More tab", () => {
    mocks.pathname = "/promotions";
    renderShell();
    expect(isActive(screen.getByTestId("nav-more"))).toBe(true);
    expect(isActive(screen.getByTestId("nav-dashboard"))).toBe(false);
  });
});

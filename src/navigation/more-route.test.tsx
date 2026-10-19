// @vitest-environment jsdom
// Route tests live under src/ (never under app/): any file in the expo-router app/ directory is
// treated as a route and bundled by `expo export`, which would pull vitest/vite into the web build.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { meContext, TENANT_A } from "../test-support/fixtures";
import type { SessionState } from "../session/reducer";

const mocks = vi.hoisted(() => ({
  state: null as unknown as SessionState,
  push: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
  Redirect: ({ href }: { href: string }) => {
    mocks.redirect(href);
    return null;
  },
}));
vi.mock("../session/SessionProvider", () => ({ useSession: () => ({ state: mocks.state }) }));

import MoreRoute from "../../app/more";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { phase: "ready", context: meContext(TENANT_A) } as SessionState;
});
afterEach(() => cleanup());

describe("More screen", () => {
  it("redirects to the dashboard until the session is ready", () => {
    mocks.state = { phase: "bootstrapping" } as SessionState;
    render(<MoreRoute />);
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("lists authorized non-primary sections and omits the primary tabs", () => {
    render(<MoreRoute />);
    // Promotions/suppliers/staff default to readable in the fixture; storefront is always reserved.
    expect(screen.getByTestId("section-promotions")).toBeTruthy();
    expect(screen.getByTestId("section-suppliers")).toBeTruthy();
    expect(screen.getByTestId("section-staff")).toBeTruthy();
    expect(screen.getByTestId("section-storefront")).toBeTruthy();
    // Primary tabs belong to the persistent bottom bar, never the More list.
    expect(screen.queryByTestId("section-products")).toBeNull();
    expect(screen.queryByTestId("section-orders")).toBeNull();
    expect(screen.queryByTestId("section-inventory")).toBeNull();
  });

  it("opens an available section on press", () => {
    render(<MoreRoute />);
    fireEvent.click(screen.getByTestId("section-promotions"));
    expect(mocks.push).toHaveBeenCalledWith("/promotions");
  });

  it("surfaces contract-pending sections honestly without a route", () => {
    render(<MoreRoute />);
    expect(screen.getByTestId("section-customers")).toBeTruthy();
    expect(screen.getByTestId("section-activity")).toBeTruthy();
    expect(screen.getByText("Coming later")).toBeTruthy();
    fireEvent.click(screen.getByTestId("section-customers"));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("hides a section whose read access the server did not grant", () => {
    mocks.state = {
      phase: "ready",
      context: meContext(TENANT_A, { suppliers: null, staff: null, promotions: null }),
    } as SessionState;
    render(<MoreRoute />);
    expect(screen.queryByTestId("section-promotions")).toBeNull();
    expect(screen.queryByTestId("section-suppliers")).toBeNull();
    expect(screen.queryByTestId("section-staff")).toBeNull();
    // Reserved + planned entries remain regardless of capability.
    expect(screen.getByTestId("section-storefront")).toBeTruthy();
    expect(screen.getByTestId("section-customers")).toBeTruthy();
  });
});

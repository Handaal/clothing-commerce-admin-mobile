import { describe, expect, it } from "vitest";

import type { AccessScopeSummary } from "./model";
import { accessScopeKindLabel, accessScopeTargetLines, isTenantWideScope } from "./scopes";

const tenantWide: AccessScopeSummary = {
  id: "s0",
  label: "Whole business",
  kind: "tenant",
  targets: [],
};
const branch: AccessScopeSummary = {
  id: "s1",
  label: "Downtown",
  kind: "branch",
  targets: ["Branch: Downtown", "Location: Main Stockroom"],
};

describe("accessScopeKindLabel", () => {
  it("labels each kind", () => {
    expect(accessScopeKindLabel("tenant")).toBe("Tenant-wide");
    expect(accessScopeKindLabel("branch")).toBe("Branch");
    expect(accessScopeKindLabel("location")).toBe("Location");
  });
});

describe("isTenantWideScope", () => {
  it("is true only for a tenant scope", () => {
    expect(isTenantWideScope(tenantWide)).toBe(true);
    expect(isTenantWideScope(branch)).toBe(false);
  });
});

describe("accessScopeTargetLines", () => {
  it("renders a tenant-wide scope as a single Tenant-wide line", () => {
    expect(accessScopeTargetLines(tenantWide)).toEqual(["Tenant-wide"]);
  });

  it("renders the adapter-provided target lines verbatim for a narrower scope", () => {
    expect(accessScopeTargetLines(branch)).toEqual([
      "Branch: Downtown",
      "Location: Main Stockroom",
    ]);
  });

  it("falls back to the kind label when a narrower scope has no target lines", () => {
    expect(
      accessScopeTargetLines({ id: "s2", label: "A branch", kind: "branch", targets: [] }),
    ).toEqual(["Branch"]);
  });
});

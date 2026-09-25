import { describe, expect, it } from "vitest";

import { meContext, TENANT_A } from "../test-support/fixtures";
import { reportingCapabilities } from "./capabilities";

describe("reporting capability guidance", () => {
  it("denies when SDK 0.12.1 context has no reports guidance", () => {
    expect(reportingCapabilities(meContext(TENANT_A))).toEqual({ canRead: false });
  });

  it("accepts only an explicit future canRead true value", () => {
    const context = meContext(TENANT_A);
    const futureContext = {
      ...context,
      access: { ...context.access, reports: { canRead: true } },
    };
    expect(reportingCapabilities(futureContext)).toEqual({ canRead: true });
    expect(
      reportingCapabilities({
        ...context,
        access: { ...context.access, reports: { canRead: "yes" } },
      } as unknown as typeof context),
    ).toEqual({ canRead: false });
  });
});

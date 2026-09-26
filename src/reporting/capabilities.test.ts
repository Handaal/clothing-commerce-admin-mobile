import { describe, expect, it } from "vitest";

import { meContext, TENANT_A } from "../test-support/fixtures";
import { reportingCapabilities } from "./capabilities";

describe("reporting capability guidance", () => {
  it("denies when reports guidance is missing", () => {
    expect(reportingCapabilities(meContext(TENANT_A))).toEqual({ canRead: false });
  });

  it("accepts the SDK's explicit canRead true guidance", () => {
    const context = meContext(TENANT_A);
    const futureContext = {
      ...context,
      access: { ...context.access, reports: { canRead: true } },
    };
    expect(reportingCapabilities(futureContext)).toEqual({ canRead: true });
  });
});

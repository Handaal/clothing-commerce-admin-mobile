import { describe, expect, it } from "vitest";

import { resolveStaffAdapter } from "./adapter";

describe("resolveStaffAdapter", () => {
  it("is unavailable (null) in production until the real Staff SDK is integrated", () => {
    // The foundation must NEVER fabricate a production adapter or a fake success — production shows the
    // explicit unavailable state. Test adapters are the only fakes (see test-support/fixtures).
    expect(resolveStaffAdapter()).toBeNull();
  });
});

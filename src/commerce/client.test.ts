import { describe, expect, it } from "vitest";

import { ADMIN_MOBILE_CLIENT } from "../config/client-metadata";
import {
  MEMBERSHIP_A,
  TENANT_A,
  recordingFetch,
  tenant,
  type RecordedRequest,
} from "../test-support/fixtures";
import { createConfiguredCommerceClient } from "./client";

const BASE = "https://api.example.test";

describe("createConfiguredCommerceClient boundary", () => {
  it("supplies the Clerk token via the getToken callback as a Bearer header", async () => {
    const recorded: RecordedRequest[] = [];
    let tokenCalls = 0;
    const client = createConfiguredCommerceClient({
      baseUrl: BASE,
      getToken: async () => {
        tokenCalls += 1;
        return "clerk-session-token";
      },
      fetch: recordingFetch([tenant(TENANT_A, "Acme", MEMBERSHIP_A)], recorded),
    });

    await client.getMyTenants();

    expect(tokenCalls).toBe(1);
    expect(recorded[0].headers["Authorization"]).toBe("Bearer clerk-session-token");
  });

  it("sends admin-mobile client metadata headers", async () => {
    const recorded: RecordedRequest[] = [];
    const client = createConfiguredCommerceClient({
      baseUrl: BASE,
      getToken: async () => "t",
      fetch: recordingFetch([], recorded),
    });

    await client.getMyTenants();

    expect(recorded[0].headers["X-Client-Type"]).toBe(ADMIN_MOBILE_CLIENT.type);
    expect(recorded[0].headers["X-Client-Type"]).toBe("admin-mobile");
    expect(recorded[0].headers["X-Client-Version"]).toBe(ADMIN_MOBILE_CLIENT.version);
  });

  it("omits Authorization when the token callback yields no token", async () => {
    const recorded: RecordedRequest[] = [];
    const client = createConfiguredCommerceClient({
      baseUrl: BASE,
      getToken: async () => null,
      fetch: recordingFetch([], recorded),
    });

    await client.getMyTenants();

    expect(recorded[0].headers["Authorization"]).toBeUndefined();
  });
});

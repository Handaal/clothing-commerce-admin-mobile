import { describe, expect, it } from "vitest";

import { getApiStatus } from "./api-status";

describe("admin mobile SDK connectivity boundary", () => {
  it("accepts a valid health response", async () => {
    await expect(
      getApiStatus({
        baseUrl: "https://api.example.test",
        fetch: async () => new Response(JSON.stringify({ status: "ok", version: "0.1.0" })),
      }),
    ).resolves.toBe("connected");
  });

  it("handles an unavailable API", async () => {
    await expect(
      getApiStatus({
        baseUrl: "https://api.example.test",
        fetch: async () => Promise.reject(new Error("offline")),
      }),
    ).resolves.toBe("unavailable");
  });

  it("rejects an invalid successful response", async () => {
    await expect(
      getApiStatus({
        baseUrl: "https://api.example.test",
        fetch: async () => new Response(JSON.stringify({ status: "ok", version: "latest" })),
      }),
    ).resolves.toBe("unavailable");
  });
});

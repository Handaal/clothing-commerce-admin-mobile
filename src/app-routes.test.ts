import { describe, expect, it } from "vitest";

// Every file under app/ is an expo-router route and is bundled by `expo export`. A test file placed
// there drags vitest (and its vite dependency) into the web build, which Metro cannot transform —
// the web export then fails. Route tests must live under src/ and import the route via ../../app/...
//
// import.meta.glob is a Vite compile-time macro (resolved at transform, relative to this file); the
// cast avoids a dependency on vite/client ambient types under `tsc`.
const strayRouteTests = (
  import.meta as unknown as { glob(pattern: string): Record<string, unknown> }
).glob("../app/**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts}");

describe("expo-router routes directory hygiene", () => {
  it("contains no test/spec files (they would be bundled as routes by `expo export`)", () => {
    expect(Object.keys(strayRouteTests)).toEqual([]);
  });
});

import { SDK_VERSION } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it } from "vitest";

import packageJson from "../package.json";

const spec = packageJson.dependencies["@shifted/clothing-commerce-sdk"];

describe("Commerce SDK artifact", () => {
  it("reports version 0.10.0 at runtime", () => {
    expect(SDK_VERSION).toBe("0.10.0");
  });

  it("is consumed from the repository's own relative vendored tarball", () => {
    expect(spec).toBe("file:vendor/shifted-clothing-commerce-sdk-0.10.0.tgz");
  });

  it("matches the frozen SDK 0.10.0 artifact SHA256", () => {
    // Tests run on the repository's required Node 24. Resolve built-ins without adding Node ambient
    // types to the Expo application tsconfig.
    const { getBuiltinModule } = (
      globalThis as unknown as {
        process: { getBuiltinModule: (name: string) => unknown };
      }
    ).process;
    const { readFileSync } = getBuiltinModule("fs") as {
      readFileSync: (path: URL) => Uint8Array;
    };
    const { createHash } = getBuiltinModule("crypto") as {
      createHash: (algorithm: string) => {
        update: (bytes: Uint8Array) => { digest: (encoding: "hex") => string };
      };
    };
    const bytes = readFileSync(
      new URL("../vendor/shifted-clothing-commerce-sdk-0.10.0.tgz", import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "74247c03b44ad81f07bf777e78bb7cdf5734c75a482744702ed26a157189cb99",
    );
  });

  it("does not depend on any sibling API repo path or workspace link", () => {
    expect(spec).not.toContain("clothing-commerce-api");
    expect(spec).not.toContain("..");
    expect(spec.startsWith("workspace:")).toBe(false);
  });
});

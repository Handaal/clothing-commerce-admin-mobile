import { SDK_VERSION } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it } from "vitest";

import packageJson from "../package.json";

const spec = packageJson.dependencies["@shifted/clothing-commerce-sdk"];

describe("Commerce SDK artifact", () => {
  it("reports version 0.2.0 at runtime", () => {
    expect(SDK_VERSION).toBe("0.2.0");
  });

  it("is consumed from the repository's own relative vendored tarball", () => {
    expect(spec).toBe("file:vendor/shifted-clothing-commerce-sdk-0.2.0.tgz");
  });

  it("does not depend on any sibling API repo path or workspace link", () => {
    expect(spec).not.toContain("clothing-commerce-api");
    expect(spec).not.toContain("..");
    expect(spec.startsWith("workspace:")).toBe(false);
  });
});

import { defineConfig, mergeConfig } from "vitest/config";
import config from "./vitest.config.mts";

export default mergeConfig(
  config,
  defineConfig({
    test: {
      include: ["acceptance/**/*.runtime.tsx"],
      environment: "jsdom",
      // Real Expo modules expect Metro's `__DEV__` global; define it before any test module imports.
      setupFiles: ["acceptance/runtime.setup.ts"],
      testTimeout: 60000,
      hookTimeout: 60000,
      maxWorkers: 1,
    },
    define: { __DEV__: "false" },
  }),
);

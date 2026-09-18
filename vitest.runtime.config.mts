import { defineConfig, mergeConfig } from "vitest/config";
import config from "./vitest.config.mts";

export default mergeConfig(
  config,
  defineConfig({
    test: {
      include: ["acceptance/**/*.runtime.tsx"],
      environment: "jsdom",
      testTimeout: 60000,
      hookTimeout: 60000,
      maxWorkers: 1,
    },
  }),
);

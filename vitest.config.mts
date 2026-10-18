import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The unit suite runs under Node by default; UI component specs opt into jsdom with a per-file
// `// @vitest-environment jsdom` pragma. React Native primitives are resolved to their
// react-native-web implementations (the same mapping the Expo web build uses) so screens can be
// rendered and asserted with @testing-library/react. The regex is anchored so it maps only the bare
// `react-native` specifier and never the `react-native-*` packages.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: "react-native-web" },
      {
        find: /^@expo\/vector-icons\/MaterialCommunityIcons$/,
        replacement: fileURLToPath(
          new URL("./src/test-support/MaterialCommunityIcons.tsx", import.meta.url),
        ),
      },
      {
        find: /^react-native-safe-area-context$/,
        replacement: fileURLToPath(
          new URL("./src/test-support/SafeAreaContext.tsx", import.meta.url),
        ),
      },
    ],
  },
});

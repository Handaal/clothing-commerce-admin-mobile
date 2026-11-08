import type { Href } from "expo-router";

interface BackRouter {
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: Href) => void;
}

/**
 * Uses stack history when one exists, otherwise navigates to a deterministic safe destination.
 *
 * Primary management destinations are reached with `replace` so the bottom navigation behaves like
 * tabs. That intentionally leaves no previous stack entry, and dispatching an unconditional
 * `router.back()` from one of those screens produces React Navigation's unhandled GO_BACK warning.
 */
export function goBackOrReplace(router: BackRouter, fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(fallback);
}

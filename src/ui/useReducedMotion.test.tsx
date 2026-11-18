// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({
  query: vi.fn<() => Promise<boolean>>(),
  listener: vi.fn<(value: boolean) => void>(),
  remove: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  AccessibilityInfo: {
    isReduceMotionEnabled: motion.query,
    addEventListener: (_event: string, listener: (value: boolean) => void) => {
      motion.listener.mockImplementation(listener);
      return { remove: motion.remove };
    },
  },
}));

import { useReducedMotion } from "./useReducedMotion";

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

it("updates motion from the device setting and cleans up its subscription", async () => {
  motion.query.mockResolvedValue(false);
  const { result, unmount } = renderHook(() => useReducedMotion());
  await act(async () => {});
  expect(result.current).toBe(false);
  act(() => motion.listener(true));
  expect(result.current).toBe(true);
  unmount();
  expect(motion.remove).toHaveBeenCalledOnce();
});

it("preserves a device change received before the initial query finishes", async () => {
  let finish!: (value: boolean) => void;
  motion.query.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = renderHook(() => useReducedMotion());
  act(() => motion.listener(true));
  await act(async () => finish(false));
  expect(result.current).toBe(true);
});

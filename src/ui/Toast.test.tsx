// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pressable, Text } from "react-native";

import { ToastProvider, useToast, type ToastApi } from "./Toast";

// A tiny harness that exposes the toast API through buttons so tests can drive it like a user.
function Harness({ onReady }: { onReady?: (api: ToastApi) => void }) {
  const toast = useToast();
  onReady?.(toast);
  return (
    <>
      <Pressable testID="fire-success" onPress={() => toast.success("Saved changes")}>
        <Text>success</Text>
      </Pressable>
      <Pressable
        testID="fire-error"
        onPress={() =>
          toast.error("Could not reach the server", {
            title: "Network problem",
            action: { label: "Retry", onPress: () => toast.success("Retried") },
          })
        }
      >
        <Text>error</Text>
      </Pressable>
    </>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ToastProvider / useToast", () => {
  it("shows a toast on success and auto-dismisses after its duration", () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    act(() => {
      fireEvent.click(screen.getByTestId("fire-success"));
    });
    expect(screen.getByText("Saved changes")).toBeTruthy();

    // Success defaults to a 4s lifetime, then a short exit phase before it unmounts.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("Saved changes")).toBeNull();
  });

  it("renders a title and keeps an error toast until dismissed, firing its action", () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    act(() => {
      fireEvent.click(screen.getByTestId("fire-error"));
    });
    expect(screen.getByText("Network problem")).toBeTruthy();
    expect(screen.getByText("Could not reach the server")).toBeTruthy();

    // The action both runs its handler (a new toast) and dismisses the source toast.
    act(() => {
      fireEvent.click(screen.getByText("Retry"));
    });
    expect(screen.getByText("Retried")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("Network problem")).toBeNull();
  });

  it("dismisses when the close control is pressed", () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("fire-success"));
    });
    expect(screen.getByText("Saved changes")).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByLabelText("Dismiss notification"));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("Saved changes")).toBeNull();
  });

  it("useToast is a safe no-op without a provider (screens stay renderable in isolation)", () => {
    let api: ToastApi | null = null;
    render(<Harness onReady={(a) => (api = a)} />);
    // Calling into the no-op API must not throw and returns an empty id.
    expect(api).not.toBeNull();
    expect((api as unknown as ToastApi).success("noop")).toBe("");
    act(() => {
      fireEvent.click(screen.getByTestId("fire-success"));
    });
    // Nothing renders because there is no viewport.
    expect(screen.queryByText("Saved changes")).toBeNull();
  });
});

// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  scheme: "light" as "light" | "dark",
  appearanceListeners: new Set<() => void>(),
  setColorScheme: vi.fn(),
  read: vi.fn<() => Promise<string | null>>(),
  write: vi.fn<(...args: string[]) => Promise<void>>(),
}));

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    Platform: { ...actual.Platform, OS: "android" },
    Appearance: {
      getColorScheme: () => native.scheme,
      setColorScheme: native.setColorScheme,
      addChangeListener: (listener: () => void) => {
        native.appearanceListeners.add(listener);
        return { remove: () => native.appearanceListeners.delete(listener) };
      },
    },
  };
});
vi.mock("expo-secure-store", () => ({ getItemAsync: native.read, setItemAsync: native.write }));
vi.mock("expo-status-bar", () => ({
  StatusBar: ({ style }: { style: string }) => <span data-testid="status-style">{style}</span>,
}));

import { TextField } from "./components";
import { darkColors, lightColors } from "./theme";
import { getThemeMode, restorePersistedTheme, setThemeMode } from "./theme-store";
import { ThemeToggle } from "./ThemeToggle";
import { ThemedStatusBar } from "./ThemedStatusBar";
import { createThemedStyles, useTheme } from "./useTheme";

const useStyles = createThemedStyles((colors) =>
  StyleSheet.create({
    surface: { backgroundColor: colors.surface },
  }),
);

function AppearanceScreen() {
  const styles = useStyles();
  const [name, setName] = useState("");
  return (
    <View testID="surface" style={styles.surface}>
      <ThemedStatusBar />
      <ThemeToggle />
      <TextField testID="name" label="Product name" value={name} onChangeText={setName} />
    </View>
  );
}

beforeEach(async () => {
  native.scheme = "light";
  native.read.mockReset().mockResolvedValue(null);
  native.write.mockReset().mockResolvedValue();
  act(() => {
    setThemeMode("light");
    setThemeMode("system");
  });
  await waitFor(() => expect(native.write).toHaveBeenLastCalledWith("admin.theme", "system"), {
    timeout: 5000,
  });
  native.write.mockClear();
  native.setColorScheme.mockClear();
});
afterEach(() => cleanup());

describe("native appearance", () => {
  it("updates mounted screens and status icons while retaining entered form data", () => {
    render(<AppearanceScreen />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "Linen shirt" } });

    fireEvent.click(screen.getByTestId("theme-dark"));
    expect(getComputedStyle(screen.getByTestId("surface")).backgroundColor).toBe("rgb(21, 27, 24)");
    expect(screen.getByTestId("status-style").textContent).toBe("light");
    expect(getComputedStyle(screen.getByTestId("name")).color).toBe("rgb(236, 230, 218)");
    expect(native.setColorScheme).toHaveBeenLastCalledWith("dark");
    expect((screen.getByTestId("name") as HTMLInputElement).value).toBe("Linen shirt");

    fireEvent.click(screen.getByTestId("theme-light"));
    expect(getComputedStyle(screen.getByTestId("surface")).backgroundColor).toBe(
      "rgb(255, 253, 249)",
    );
    expect(screen.getByTestId("status-style").textContent).toBe("dark");
    expect(getComputedStyle(screen.getByTestId("name")).color).toBe("rgb(33, 28, 24)");
    expect((screen.getByTestId("name") as HTMLInputElement).value).toBe("Linen shirt");
  });

  it("reacts to system changes while the preference remains system and respects explicit overrides", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors).toBe(lightColors);
    act(() => {
      native.scheme = "dark";
      native.appearanceListeners.forEach((listener) => listener());
    });
    expect(result.current.mode).toBe("system");
    expect(result.current.colors).toBe(darkColors);
    act(() => setThemeMode("light"));
    expect(result.current.colors).toBe(lightColors);
    act(() => setThemeMode("system"));
    expect(result.current.colors).toBe(darkColors);
    expect(native.setColorScheme).toHaveBeenLastCalledWith("unspecified");
  });

  it("restores a saved native preference into the palette", async () => {
    native.read.mockResolvedValueOnce("dark");
    const { result } = renderHook(() => useTheme());
    await act(() => restorePersistedTheme());
    expect(result.current.mode).toBe("dark");
    expect(result.current.colors).toBe(darkColors);
    expect(native.setColorScheme).toHaveBeenLastCalledWith("dark");
  });

  it("keeps a selection made while storage restoration is pending", async () => {
    let finishRead!: (value: string) => void;
    native.read.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    const restoration = restorePersistedTheme();
    act(() => setThemeMode("light"));
    finishRead("dark");
    await restoration;
    expect(getThemeMode()).toBe("light");
  });

  it("serializes rapid selections so the last choice is the last persisted value", async () => {
    let finishWrite!: () => void;
    native.write.mockClear();
    native.write.mockReturnValueOnce(
      new Promise((resolve) => {
        finishWrite = resolve;
      }),
    );
    act(() => {
      setThemeMode("dark");
      setThemeMode("light");
    });
    await waitFor(() => expect(native.write).toHaveBeenCalledTimes(1));
    finishWrite();
    await waitFor(() => expect(native.write).toHaveBeenCalledTimes(2));
    expect(native.write).toHaveBeenLastCalledWith("admin.theme", "light");
  });
});

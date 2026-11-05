import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useI18n } from "../i18n";
import { AppIcon, type AppIconName } from "./Icon";
import { colors, radius, shadows, spacing, typography } from "./theme";

export type ToastTone = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  icon?: AppIconName;
  onPress: () => void;
}

export interface ToastInput {
  tone?: ToastTone;
  title?: string;
  message: string;
  /** Auto-dismiss delay in ms. Defaults to 4s (success/info) or 6s (error/warning). 0 = sticky. */
  durationMs?: number;
  action?: ToastAction;
}

interface ToastItem extends ToastInput {
  id: string;
  leaving?: boolean;
}

export interface ToastApi {
  show: (toast: ToastInput) => string;
  success: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => string;
  error: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => string;
  info: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => string;
  warning: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => string;
  dismiss: (id: string) => void;
}

// A tolerant no-op fallback so screens that call `useToast()` remain renderable in isolation (unit
// tests mount screens without the provider). Toasts are a presentation concern layered on top of the
// inline notices, never the sole channel for a failure — so a missing provider degrades silently.
const NOOP_API: ToastApi = {
  show: () => "",
  success: () => "",
  error: () => "",
  info: () => "",
  warning: () => "",
  dismiss: () => {},
};

const ToastContext = createContext<ToastApi | null>(null);

const EXIT_MS = 190;

const toneDuration: Record<ToastTone, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 6000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const remove = useCallback(
    (id: string) => {
      clearTimer(id);
      // Two-phase removal so the exit animation can play on web before the node unmounts.
      setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), EXIT_MS);
    },
    [clearTimer],
  );

  const show = useCallback(
    (toast: ToastInput): string => {
      const id = `toast-${(seq.current += 1)}`;
      const tone = toast.tone ?? "info";
      const duration = toast.durationMs ?? toneDuration[tone];
      setToasts((current) => [...current, { ...toast, tone, id }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => remove(id), duration),
        );
      }
      return id;
    },
    [remove],
  );

  const api = useMemo<ToastApi>(() => {
    const withTone =
      (tone: ToastTone) => (message: string, opts?: Omit<ToastInput, "message" | "tone">) =>
        show({ ...opts, tone, message });
    return {
      show,
      success: withTone("success"),
      error: withTone("error"),
      info: withTone("info"),
      warning: withTone("warning"),
      dismiss: remove,
    };
  }, [show, remove]);

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={remove} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_API;
}

const toneIcon: Record<ToastTone, AppIconName> = {
  success: "check-circle",
  error: "alert-circle",
  info: "information",
  warning: "alert",
};

const toneColor: Record<ToastTone, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.info,
  warning: colors.warning,
};

// react-native-web renders `dataSet` to `data-*`; the global stylesheet (app/+html.tsx) animates
// `[data-toast]` in and `[data-toast-leaving]` out. RN types don't model dataSet.
const toastEnter = { dataSet: { toast: "in" } } as unknown as ViewProps;
const toastLeave = { dataSet: { toast: "in", "toast-leaving": "true" } } as unknown as ViewProps;

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.viewport, { paddingTop: insets.top + spacing.sm }]}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </View>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { isRTL, dir } = useI18n();
  const tone = toast.tone ?? "info";
  const accent = toneColor[tone];
  return (
    <View
      accessibilityRole="alert"
      style={[styles.toast, { direction: dir, borderStartColor: accent }]}
      {...(toast.leaving ? toastLeave : toastEnter)}
    >
      <View style={[styles.iconChip, { backgroundColor: toneSoft[tone] }]}>
        <AppIcon name={toneIcon[tone]} size={18} color={accent} />
      </View>
      <View style={styles.copy}>
        {toast.title ? (
          <Text style={[styles.title, { textAlign: isRTL ? "right" : "left" }]}>{toast.title}</Text>
        ) : null}
        <Text style={[styles.message, { textAlign: isRTL ? "right" : "left" }]}>
          {toast.message}
        </Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              toast.action?.onPress();
              onDismiss();
            }}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
          >
            {toast.action.icon ? (
              <AppIcon name={toast.action.icon} size={16} color={accent} />
            ) : null}
            <Text style={[styles.actionLabel, { color: accent }]}>{toast.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        hitSlop={8}
        onPress={onDismiss}
        style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
      >
        <AppIcon name="close" size={16} color={colors.inkSubtle} />
      </Pressable>
    </View>
  );
}

const toneSoft: Record<ToastTone, string> = {
  success: colors.successSoft,
  error: colors.dangerSoft,
  info: colors.infoSoft,
  warning: colors.warningSoft,
};

const styles = StyleSheet.create({
  viewport: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    zIndex: 1000,
  },
  toast: {
    width: "100%",
    maxWidth: 460,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStartWidth: 4,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceRaised,
    ...shadows.raised,
  },
  iconChip: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  copy: { flex: 1, gap: 3, paddingTop: 1 },
  title: { color: colors.ink, ...typography.cardTitle },
  message: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    paddingVertical: 4,
  },
  actionLabel: { fontSize: 14, fontWeight: "800" },
  close: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
});

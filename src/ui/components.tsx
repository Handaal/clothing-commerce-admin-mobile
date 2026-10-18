import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppIcon, type AppIconName } from "./Icon";
import { colors, layout, radius, shadows, spacing, typography } from "./theme";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

/** A vertically scrolling variant of {@link Screen}, for list and detail surfaces. */
export function ScrollScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  icon,
  action,
  onBack,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  icon?: AppIconName;
  action?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <View style={styles.pageHeader}>
      {onBack ? <TextButton label="Back" icon="arrow-left" onPress={onBack} /> : null}
      <View style={styles.pageHeaderMain}>
        {icon ? (
          <View style={styles.pageHeaderIcon}>
            <AppIcon name={icon} size={25} color={colors.brand} />
          </View>
        ) : null}
        <View style={styles.pageHeaderCopy}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Title>{title}</Title>
          {description ? <Body>{description}</Body> : null}
        </View>
      </View>
      {action ? <View style={styles.pageHeaderAction}>{action}</View> : null}
    </View>
  );
}

export function Surface({
  children,
  testID,
  style,
  tone = "default",
}: {
  children: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "muted" | "brand" | "accent";
}) {
  return (
    <View testID={testID} style={[styles.surface, surfaceToneStyles[tone], style]}>
      {children}
    </View>
  );
}

export function FormSection({
  title,
  description,
  icon,
  children,
  testID,
}: {
  title: string;
  description?: string;
  icon?: AppIconName;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <Surface testID={testID} style={styles.formSection}>
      <View style={styles.formSectionHeader}>
        {icon ? (
          <View style={styles.formSectionIcon}>
            <AppIcon name={icon} size={21} color={colors.brand} />
          </View>
        ) : null}
        <View style={styles.formSectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
        </View>
      </View>
      {children}
    </Surface>
  );
}

export function Notice({
  title,
  message,
  tone = "info",
  testID,
  action,
}: {
  title?: string;
  message: string;
  tone?: "info" | "success" | "warning" | "danger";
  testID?: string;
  action?: ReactNode;
}) {
  const icon: AppIconName =
    tone === "success"
      ? "check-circle-outline"
      : tone === "warning"
        ? "alert-outline"
        : tone === "danger"
          ? "alert-circle-outline"
          : "information-outline";
  return (
    <View testID={testID} style={[styles.notice, noticeStyles[tone]]}>
      <AppIcon name={icon} size={22} color={noticeInk[tone]} />
      <View style={styles.noticeCopy}>
        {title ? (
          <Text style={[styles.noticeTitle, { color: noticeInk[tone] }]}>{title}</Text>
        ) : null}
        <Text style={[styles.noticeMessage, { color: noticeInk[tone] }]}>{message}</Text>
        {action ? <View style={styles.noticeAction}>{action}</View> : null}
      </View>
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder = "Search",
  testID,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  return (
    <View style={styles.searchField}>
      <AppIcon name="magnify" size={21} color={colors.inkSubtle} />
      <TextInput
        testID={testID}
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSubtle}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.searchInput}
      />
      {value ? (
        <Pressable
          testID={testID ? `${testID}-clear` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          onPress={() => onChangeText("")}
          style={({ pressed }) => [styles.clearSearch, pressed && styles.buttonPressed]}
        >
          <AppIcon name="close-circle" size={20} color={colors.inkSubtle} />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  icon?: AppIconName;
}

export function FilterChips<T extends string>({
  options,
  selected,
  onSelect,
  testIDPrefix,
}: {
  options: readonly FilterOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  testIDPrefix?: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterChips}
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            key={option.value}
            testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            onPress={() => onSelect(option.value)}
            style={({ pressed }) => [
              styles.filterChip,
              active && styles.filterChipActive,
              pressed && styles.buttonPressed,
            ]}
          >
            {option.icon ? (
              <AppIcon
                name={option.icon}
                size={16}
                color={active ? colors.white : colors.inkMuted}
              />
            ) : null}
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function AccordionTrigger({
  title,
  description,
  icon,
  expanded,
  onPress,
  testID,
}: {
  title: string;
  description?: string;
  icon: AppIconName;
  expanded: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      aria-expanded={expanded}
      onPress={onPress}
      style={({ pressed }) => [
        styles.accordionTrigger,
        expanded && styles.accordionTriggerExpanded,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.accordionIcon, expanded && styles.accordionIconExpanded]}>
        <AppIcon name={icon} size={21} color={expanded ? colors.white : colors.brand} />
      </View>
      <View style={styles.accordionCopy}>
        <Text style={styles.accordionTitle}>{title}</Text>
        {description ? <Text style={styles.accordionDescription}>{description}</Text> : null}
      </View>
      <AppIcon name={expanded ? "chevron-up" : "chevron-down"} size={22} color={colors.inkSubtle} />
    </Pressable>
  );
}

export function MetricCard({
  label,
  value,
  icon,
  tone = "brand",
}: {
  label: string;
  value: string;
  icon: AppIconName;
  tone?: "brand" | "accent" | "neutral";
}) {
  const color =
    tone === "accent" ? colors.accent : tone === "neutral" ? colors.inkMuted : colors.brand;
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>
        <AppIcon name={icon} size={20} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

/** A small, non-interactive status pill (e.g. a product/variant status). */
export function Badge({
  label,
  testID,
  tone = badgeTone(label),
}: {
  label: string;
  testID?: string;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger";
}) {
  return (
    <View style={[styles.badge, badgeStyles[tone]]}>
      <Text testID={testID} style={[styles.badgeText, badgeTextStyles[tone]]}>
        {label}
      </Text>
    </View>
  );
}

function badgeTone(label: string): "neutral" | "brand" | "success" | "warning" | "danger" {
  const value = label.toLowerCase();
  if (["active", "completed", "published", "succeeded", "in"].includes(value)) return "success";
  if (["failed", "cancelled", "suspended", "archived", "inactive"].includes(value)) return "danger";
  if (["pending", "invited", "planned", "reserved"].includes(value)) return "warning";
  if (["online", "pos", "read", "manage"].includes(value)) return "brand";
  return "neutral";
}

/** A pressable list row. Purely navigational — it never performs a mutation. */
export function PressableRow({
  onPress,
  testID,
  children,
}: {
  onPress: () => void;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowContent}>{children}</View>
      <AppIcon name="chevron-right" size={22} color={colors.inkSubtle} />
    </Pressable>
  );
}

/** A non-interactive list row (the visual sibling of {@link PressableRow}) for read-only surfaces. */
export function SurfaceRow({ testID, children }: { testID?: string; children: ReactNode }) {
  return (
    <View testID={testID} style={styles.row}>
      {children}
    </View>
  );
}

export function Eyebrow({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text testID={testID} style={styles.eyebrow}>
      {children}
    </Text>
  );
}

export function Title({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text testID={testID} style={styles.title}>
      {children}
    </Text>
  );
}

export function Body({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text testID={testID} style={styles.body}>
      {children}
    </Text>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <View style={styles.loadingRow}>
      <ActivityIndicator color={colors.brand} />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  testID,
  icon,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  icon?: AppIconName;
  variant?: "primary" | "secondary";
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {icon ? (
        <AppIcon
          name={icon}
          size={19}
          color={variant === "primary" ? colors.white : colors.brand}
        />
      ) : null}
      <Text style={[styles.buttonText, variant === "secondary" && styles.buttonTextSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: AppIconName;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.textButton}
    >
      {icon ? <AppIcon name={icon} size={18} color={colors.brand} /> : null}
      <Text style={styles.textButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function Divider(props: { style?: ViewStyle }) {
  return <View style={[styles.divider, props.style]} />;
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  badge,
}: {
  icon: AppIconName;
  title: string;
  message: string;
  badge?: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <AppIcon name={icon} size={32} color={colors.brand} />
      </View>
      {badge ? <Badge label={badge} tone="warning" /> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

/** A labelled whole-number input. The raw string is owned by the caller so it can validate before use. */
export function NumberField({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
  editable?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={[styles.input, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder={placeholder}
        placeholderTextColor={colors.inkSubtle}
      />
    </View>
  );
}

/** A labelled free-text input. `multiline` turns it into a short text area (e.g. a description). */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
  multiline = false,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSubtle}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

/**
 * A two-step confirmation button for destructive/irreversible-feeling actions (e.g. archiving a
 * product). The first press arms it and shows a confirm label; the second press within the same mount
 * invokes the action. Works uniformly on web and native (no reliance on a native Alert).
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
  testID,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          if (armed) {
            setArmed(false);
            onConfirm();
          } else {
            setArmed(true);
          }
        }}
        style={({ pressed }) => [
          styles.button,
          styles.buttonDanger,
          disabled && styles.buttonDisabled,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>{armed ? confirmLabel : label}</Text>
      </Pressable>
      {armed ? <TextButton label="Cancel" onPress={() => setArmed(false)} /> : null}
    </View>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** A labelled list-of-options selector (no native picker dependency). Selecting an option is not a
 * mutation — it only updates local form state. */
export function SelectField({
  label,
  options,
  selected,
  onSelect,
  testIDPrefix,
  emptyLabel,
}: {
  label: string;
  options: SelectOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  testIDPrefix?: string;
  emptyLabel?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {options.length === 0 ? (
        <Text style={styles.body}>{emptyLabel ?? "No options available."}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {options.map((option) => {
            const isSelected = option.value === selected;
            return (
              <Pressable
                key={option.value}
                testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: option.disabled }}
                disabled={option.disabled}
                onPress={() => onSelect(option.value)}
                style={({ pressed }) => [
                  styles.option,
                  isSelected && styles.optionSelected,
                  option.disabled && styles.optionDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  neutral: { backgroundColor: colors.surfaceMuted },
  brand: { backgroundColor: colors.brandSoft },
  success: { backgroundColor: colors.successSoft },
  warning: { backgroundColor: colors.warningSoft },
  danger: { backgroundColor: colors.dangerSoft },
});

const badgeTextStyles = StyleSheet.create({
  neutral: { color: colors.inkMuted },
  brand: { color: colors.brand },
  success: { color: colors.success },
  warning: { color: colors.warning },
  danger: { color: colors.danger },
});

const surfaceToneStyles = StyleSheet.create({
  default: { backgroundColor: colors.surface },
  muted: { backgroundColor: colors.surfaceMuted },
  brand: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoftStrong },
  accent: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
});

const noticeStyles = StyleSheet.create({
  info: { backgroundColor: colors.infoSoft, borderColor: "#CFE0FF" },
  success: { backgroundColor: colors.successSoft, borderColor: "#CDEED8" },
  warning: { backgroundColor: colors.warningSoft, borderColor: "#F5DFC0" },
  danger: { backgroundColor: colors.dangerSoft, borderColor: "#F5CDD3" },
});

const noticeInk = {
  info: colors.info,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
} as const;

export const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  scrollContent: { alignItems: "center", padding: spacing.xl, paddingBottom: spacing.xxxl * 2 },
  page: { width: "100%", maxWidth: layout.contentMaxWidth, gap: spacing.lg },
  pageHeader: { gap: spacing.sm, marginBottom: spacing.xs },
  pageHeaderMain: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  pageHeaderIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  pageHeaderCopy: { flex: 1, gap: spacing.xs },
  pageHeaderAction: { alignSelf: "flex-end" },
  surface: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  formSection: {
    width: "100%",
    maxWidth: layout.formMaxWidth,
    alignSelf: "center",
    gap: spacing.lg,
  },
  formSectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  formSectionIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  formSectionCopy: { flex: 1, gap: spacing.xs },
  sectionDescription: { color: colors.inkMuted, ...typography.caption },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  noticeCopy: { flex: 1, gap: spacing.xs },
  noticeTitle: { ...typography.cardTitle },
  noticeMessage: { ...typography.body },
  noticeAction: { marginTop: spacing.xs },
  searchField: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, minHeight: 48, color: colors.ink, fontSize: 16, fontWeight: "500" },
  clearSearch: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChips: { gap: spacing.sm, paddingVertical: spacing.xs },
  filterChip: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  filterChipActive: { borderColor: colors.brand, backgroundColor: colors.brand },
  filterChipText: { color: colors.inkMuted, fontSize: 13, fontWeight: "700" },
  filterChipTextActive: { color: colors.white },
  accordionTrigger: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  accordionTriggerExpanded: {
    borderColor: colors.brandSoftStrong,
    backgroundColor: colors.brandSoft,
  },
  accordionIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  accordionIconExpanded: { backgroundColor: colors.brand },
  accordionCopy: { flex: 1, gap: 2 },
  accordionTitle: { color: colors.ink, ...typography.cardTitle },
  accordionDescription: { color: colors.inkMuted, ...typography.caption },
  metricCard: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
  metricIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.xs,
  },
  metricValue: { color: colors.ink, fontSize: 23, lineHeight: 29, fontWeight: "800" },
  metricLabel: { color: colors.inkMuted, ...typography.caption },
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surfaceRaised,
    ...shadows.card,
  },
  rowContent: { flex: 1, gap: spacing.sm },
  rowPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  card: {
    width: "100%",
    maxWidth: 480,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.xxl,
    gap: spacing.lg,
    ...shadows.card,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: { color: colors.ink, ...typography.pageTitle },
  body: { color: colors.inkMuted, ...typography.body },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
  },
  button: {
    minHeight: 50,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  buttonSecondary: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandSoftStrong,
  },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.5 },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  buttonTextSecondary: { color: colors.brand },
  textButton: {
    minHeight: 40,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  textButtonLabel: { color: colors.brand, fontSize: 14, fontWeight: "800" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  infoLabel: { color: colors.inkMuted, fontSize: 14, fontWeight: "600" },
  infoValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTitle: { color: colors.ink, ...typography.sectionTitle },
  sectionDetail: { color: colors.inkSubtle, fontSize: 12, fontWeight: "700" },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
    paddingVertical: 48,
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
  },
  emptyTitle: { color: colors.ink, fontSize: 24, fontWeight: "800", textAlign: "center" },
  emptyMessage: {
    maxWidth: 380,
    color: colors.inkMuted,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 23,
    textAlign: "center",
  },
  field: { gap: spacing.sm },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  inputDisabled: { backgroundColor: colors.surfaceMuted, color: colors.inkSubtle },
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  optionDisabled: { opacity: 0.45 },
  optionText: { color: colors.inkMuted, fontSize: 15, fontWeight: "600" },
  optionTextSelected: { color: colors.brand, fontWeight: "800" },
});

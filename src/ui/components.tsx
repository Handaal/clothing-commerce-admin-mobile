import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { directionalIcon, endAlign, startAlign, useI18n } from "../i18n";
import { AppIcon, type AppIconName } from "./Icon";
import { colors, layout, radius, shadows, spacing, typography } from "./theme";

/**
 * react-native-web renders `dataSet` to real `data-*` attributes. The global web stylesheet
 * (app/+html.tsx) gives `[data-lift]` a gentle translate-up on hover and `[data-anim]` a smooth
 * transition. React Native's types don't model `dataSet`, so we attach it through a loosely-typed
 * prop bag; it is simply ignored on native.
 */
export const webLift = { dataSet: { lift: "true" } } as unknown as ViewProps;
const webAnim = { dataSet: { anim: "true" } } as unknown as ViewProps;

function readingDirection(isRTL: boolean) {
  return {
    textAlign: startAlign(isRTL),
    writingDirection: isRTL ? ("rtl" as const) : ("ltr" as const),
  };
}

function pageHeaderReadingDirection(isRTL: boolean) {
  return {
    // Native RTL swaps physical left/right alignment. Supplying `left` there produces the visual
    // reading-start edge in both LTR and RTL; web uses the explicit logical result.
    textAlign: Platform.OS === "web" ? startAlign(isRTL) : ("left" as const),
    writingDirection: isRTL ? ("rtl" as const) : ("ltr" as const),
  };
}

export function Screen({ children }: { children: ReactNode }) {
  const { dir } = useI18n();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { direction: dir }]}>
      <View style={styles.container}>
        <View style={styles.card}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

/** A vertically scrolling variant of {@link Screen}, for list and detail surfaces. */
export function ScrollScreen({
  children,
  wide = false,
  persistentAction,
  scrollToTopSignal,
}: {
  children: ReactNode;
  wide?: boolean;
  persistentAction?: ReactNode;
  scrollToTopSignal?: number;
}) {
  const { dir } = useI18n();
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (scrollToTopSignal === undefined) return;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [scrollToTopSignal]);
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { direction: dir }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          persistentAction ? styles.scrollContentWithAction : null,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.page, wide && styles.pageWide]}>{children}</View>
      </ScrollView>
      {persistentAction ? (
        <View style={styles.persistentActionLayer} pointerEvents="box-none">
          <View
            style={[styles.persistentActionContent, wide && styles.persistentActionContentWide]}
          >
            {persistentAction}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export interface ActionDockItem {
  label: string;
  icon: AppIconName;
  onPress: () => void;
  testID?: string;
  emphasis?: "primary" | "secondary";
}

/** Contextual actions anchored above the persistent bottom navigation. */
export function ActionDock({ actions }: { actions: readonly ActionDockItem[] }) {
  if (actions.length === 0) return null;
  return (
    <View style={styles.actionDock}>
      {actions.map((action, index) => {
        const primary = (action.emphasis ?? (index === 0 ? "primary" : "secondary")) === "primary";
        return (
          <Pressable
            key={`${action.label}-${index}`}
            testID={action.testID}
            accessibilityRole="button"
            onPress={action.onPress}
            {...webLift}
            style={({ pressed }) => [
              styles.actionDockButton,
              primary && styles.actionDockButtonPrimary,
              pressed && styles.buttonPressed,
            ]}
          >
            <AppIcon name={action.icon} size={18} color={primary ? colors.white : colors.brand} />
            <Text
              numberOfLines={1}
              style={[styles.actionDockLabel, primary && styles.actionDockLabelPrimary]}
            >
              {action.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  const { t, isRTL, dir } = useI18n();
  return (
    <View testID="page-header" style={[styles.pageHeader, { direction: dir }]}>
      <View style={styles.pageHeaderRow}>
        <View style={styles.pageHeaderMain}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
              onPress={onBack}
              {...webLift}
              style={({ pressed }) => [styles.pageHeaderBack, pressed && styles.buttonPressed]}
            >
              <AppIcon name={directionalIcon("arrow-left", isRTL)} size={20} color={colors.brand} />
            </Pressable>
          ) : null}
          <View style={styles.pageHeaderCopy}>
            {icon || eyebrow ? (
              <View style={styles.pageHeaderMeta}>
                {icon ? <AppIcon name={icon} size={16} color={colors.accent} /> : null}
                {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              </View>
            ) : null}
            <Text
              testID="page-header-title"
              style={[styles.pageTitle, pageHeaderReadingDirection(isRTL)]}
            >
              {title}
            </Text>
            {description ? (
              <Text
                testID="page-header-description"
                numberOfLines={2}
                style={[
                  styles.pageHeaderDescription,
                  pageHeaderReadingDirection(isRTL),
                  { alignSelf: isRTL ? "flex-end" : "flex-start" },
                ]}
              >
                {description}
              </Text>
            ) : null}
          </View>
        </View>
        {action ? <View style={styles.pageHeaderAction}>{action}</View> : null}
      </View>
      <View style={styles.pageHeaderRule}>
        <View style={styles.pageHeaderRuleAccent} />
        <View style={styles.pageHeaderRuleLine} />
      </View>
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
      <View style={[styles.noticeIcon, { backgroundColor: noticeIconBg[tone] }]}>
        <AppIcon name={icon} size={18} color={noticeInk[tone]} />
      </View>
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

/**
 * A standardized failure notice for a mutation/operation error. The `heading`/`message` come from a
 * domain `describe*WriteError` helper; the action reflects the recovery affordance — a safe `Retry`
 * (reusing the idempotency key) when the outcome was ambiguous, otherwise a `Dismiss`. Pairs with a
 * transient toast but persists on screen so the manager can read and act on it.
 */
export function ErrorNotice({
  heading,
  message,
  onRetry,
  onDismiss,
  retryLabel,
  testID,
}: {
  heading?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryLabel?: string;
  testID?: string;
}) {
  const { t } = useI18n();
  return (
    <Notice
      tone="danger"
      title={heading}
      message={message}
      testID={testID}
      action={
        onRetry ? (
          <TextButton label={retryLabel ?? t("common.retry")} icon="refresh" onPress={onRetry} />
        ) : onDismiss ? (
          <TextButton label={t("common.dismiss")} icon="close" onPress={onDismiss} />
        ) : undefined
      }
    />
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
  testID,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  const { t, isRTL } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("common.search");
  return (
    <View style={styles.searchField}>
      <AppIcon name="magnify" size={21} color={colors.inkSubtle} />
      <TextInput
        testID={testID}
        accessibilityLabel={resolvedPlaceholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={resolvedPlaceholder}
        placeholderTextColor={colors.inkSubtle}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.searchInput, readingDirection(isRTL)]}
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
  const { dir } = useI18n();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ direction: dir }}
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
  const iconBg =
    tone === "accent"
      ? colors.accentSoft
      : tone === "neutral"
        ? colors.surfaceMuted
        : colors.brandSoft;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: iconBg }]}>
        <AppIcon name={icon} size={20} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export interface SummaryMetric {
  label: string;
  value: string;
  icon: AppIconName;
  tone?: "brand" | "accent" | "neutral";
}

/** A compact, repeatable summary band for list screens. */
export function SummaryStrip({
  items,
  testID,
}: {
  items: readonly SummaryMetric[];
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.summaryStrip}>
      {items.map((item) => {
        const color =
          item.tone === "accent"
            ? colors.accent
            : item.tone === "neutral"
              ? colors.inkMuted
              : colors.brand;
        const backgroundColor =
          item.tone === "accent"
            ? colors.accentSoft
            : item.tone === "neutral"
              ? colors.surfaceMuted
              : colors.brandSoft;
        return (
          <View key={item.label} style={styles.summaryMetric}>
            <View style={[styles.summaryMetricIcon, { backgroundColor }]}>
              <AppIcon name={item.icon} size={18} color={color} />
            </View>
            <View style={styles.summaryMetricCopy}>
              <Text style={styles.summaryMetricValue}>{item.value}</Text>
              <Text numberOfLines={1} style={styles.summaryMetricLabel}>
                {item.label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Phone-first list that promotes cards into two balanced columns on large phones/tablets. It keeps
 * the exact child test IDs and interactions; the wrapper changes presentation only.
 */
export function ResponsiveList({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const columns = width >= 760 ? 2 : 1;
  const items = Children.toArray(children);
  return (
    <View style={styles.responsiveList}>
      {items.map((child, index) => (
        <View
          key={isValidElement(child) && child.key !== null ? child.key : index}
          style={[styles.responsiveListItem, columns === 2 && styles.responsiveListItemWide]}
        >
          {child}
        </View>
      ))}
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
  const { isRTL, dir } = useI18n();
  return (
    <View style={[styles.badge, badgeStyles[tone], { direction: dir }]}>
      <View style={[styles.badgeDot, { backgroundColor: badgeDotColor[tone] }]} />
      <Text
        testID={testID}
        style={[styles.badgeText, badgeTextStyles[tone], readingDirection(isRTL)]}
      >
        {label}
      </Text>
    </View>
  );
}

function badgeTone(label: string): "neutral" | "brand" | "success" | "warning" | "danger" {
  const value = label.toLowerCase();
  if (["active", "completed", "published", "succeeded", "captured"].includes(value))
    return "success";
  if (["failed", "cancelled", "suspended", "archived", "inactive"].includes(value)) return "danger";
  if (["pending", "invited", "planned", "reserved", "authorized"].includes(value)) return "warning";
  // Channels/access labels are descriptive metadata, not health states; keep them neutral so semantic
  // success/warning/danger colors remain meaningful and visually scarce.
  if (["online", "pos", "read", "manage"].includes(value)) return "neutral";
  return "neutral";
}

/** A pressable list row. Purely navigational — it never performs a mutation. */
export function PressableRow({
  onPress,
  testID,
  children,
  density = "default",
}: {
  onPress: () => void;
  testID?: string;
  children: ReactNode;
  density?: "default" | "compact";
}) {
  const { isRTL, dir } = useI18n();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      {...webLift}
      style={({ pressed }) => [
        styles.row,
        { direction: dir },
        density === "compact" && styles.rowCompact,
        styles.rowInteractive,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.rowContent, density === "compact" && styles.rowContentCompact]}>
        {children}
      </View>
      <AppIcon name={directionalIcon("chevron-right", isRTL)} size={22} color={colors.inkSubtle} />
    </Pressable>
  );
}

/** A non-interactive list row (the visual sibling of {@link PressableRow}) for read-only surfaces. */
export function SurfaceRow({
  testID,
  children,
  density = "default",
}: {
  testID?: string;
  children: ReactNode;
  density?: "default" | "compact";
}) {
  const { dir } = useI18n();
  return (
    <View
      testID={testID}
      style={[styles.row, { direction: dir }, density === "compact" && styles.rowCompact]}
    >
      {children}
    </View>
  );
}

export function Eyebrow({ children, testID }: { children: ReactNode; testID?: string }) {
  const { isRTL } = useI18n();
  return (
    <Text testID={testID} style={[styles.eyebrow, readingDirection(isRTL)]}>
      {children}
    </Text>
  );
}

export function Title({ children, testID }: { children: ReactNode; testID?: string }) {
  const { isRTL } = useI18n();
  return (
    <Text testID={testID} style={[styles.title, readingDirection(isRTL)]}>
      {children}
    </Text>
  );
}

export function Body({ children, testID }: { children: ReactNode; testID?: string }) {
  const { isRTL } = useI18n();
  return (
    <Text testID={testID} style={[styles.body, readingDirection(isRTL)]}>
      {children}
    </Text>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  const { isRTL, dir } = useI18n();
  return (
    <View style={[styles.loadingRow, { direction: dir }]}>
      <ActivityIndicator color={colors.brand} />
      <Text style={[styles.body, readingDirection(isRTL)]}>{label}</Text>
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
  const { isRTL, dir } = useI18n();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      {...(variant === "primary" && !disabled ? webLift : {})}
      style={({ pressed }) => [
        styles.button,
        { direction: dir },
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
      <Text
        style={[
          styles.buttonText,
          { writingDirection: isRTL ? "rtl" : "ltr" },
          variant === "secondary" && styles.buttonTextSecondary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function HeaderIconButton({
  label,
  onPress,
  testID,
  icon,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  icon: AppIconName;
  variant?: "primary" | "secondary";
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...webLift}
      style={({ pressed }) => [
        styles.headerButton,
        !primary && styles.headerButtonSecondary,
        pressed && styles.buttonPressed,
      ]}
    >
      <AppIcon name={icon} size={18} color={primary ? colors.white : colors.brand} />
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
  const { isRTL } = useI18n();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.textButton}
    >
      {icon ? <AppIcon name={icon} size={18} color={colors.brand} /> : null}
      <Text style={[styles.textButtonLabel, readingDirection(isRTL)]}>{label}</Text>
    </Pressable>
  );
}

export function InfoRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  const { isRTL, dir } = useI18n();
  return (
    <View style={[styles.infoRow, { direction: dir }]} testID={testID}>
      <Text style={[styles.infoLabel, readingDirection(isRTL)]}>{label}</Text>
      <Text style={[styles.infoValue, { textAlign: endAlign(isRTL), writingDirection: "auto" }]}>
        {value}
      </Text>
    </View>
  );
}

export function Divider(props: { style?: ViewStyle }) {
  return <View style={[styles.divider, props.style]} />;
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  const { isRTL, dir } = useI18n();
  return (
    <View style={[styles.sectionHeading, { direction: dir }]}>
      <View style={styles.sectionHeadingMain}>
        <View style={styles.sectionMarker} />
        <Text style={[styles.sectionTitle, readingDirection(isRTL)]}>{title}</Text>
      </View>
      {detail ? (
        <Text style={[styles.sectionDetail, readingDirection(isRTL)]}>{detail}</Text>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  badge,
  action,
}: {
  icon: AppIconName;
  title: string;
  message: string;
  badge?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <AppIcon name={icon} size={32} color={colors.brand} />
      </View>
      {badge ? <Badge label={badge} tone="warning" /> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/** A field label with an optional "required" marker. */
export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const { isRTL } = useI18n();
  return (
    <Text style={[styles.fieldLabel, readingDirection(isRTL)]}>
      {label}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );
}

/** An inline, below-the-field validation message with an alert icon. Renders nothing when empty. */
export function FieldError({ message, testID }: { message?: string | null; testID?: string }) {
  const { isRTL, dir } = useI18n();
  if (!message) return null;
  return (
    <View style={[styles.fieldError, { direction: dir }]} testID={testID}>
      <AppIcon name="alert-circle-outline" size={14} color={colors.danger} />
      <Text style={[styles.fieldErrorText, readingDirection(isRTL)]}>{message}</Text>
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
  required,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
  editable?: boolean;
  required?: boolean;
  error?: string | null;
}) {
  const { isRTL } = useI18n();
  return (
    <View style={styles.field}>
      <FieldLabel label={label} required={required} />
      <TextInput
        testID={testID}
        style={[
          styles.input,
          readingDirection(isRTL),
          !editable && styles.inputDisabled,
          error ? styles.inputError : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder={placeholder}
        placeholderTextColor={colors.inkSubtle}
      />
      <FieldError message={error} testID={testID ? `${testID}-error` : undefined} />
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
  required,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  required?: boolean;
  error?: string | null;
  /** Optional helper text shown below the field when there is no error — gentle inline guidance. */
  hint?: string;
}) {
  const { isRTL } = useI18n();
  return (
    <View style={styles.field}>
      <FieldLabel label={label} required={required} />
      <TextInput
        testID={testID}
        style={[
          styles.input,
          readingDirection(isRTL),
          multiline && styles.inputMultiline,
          error ? styles.inputError : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSubtle}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
      />
      {error ? (
        <FieldError message={error} testID={testID ? `${testID}-error` : undefined} />
      ) : hint ? (
        <Text style={[styles.fieldHint, readingDirection(isRTL)]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * A square checkbox with an optional inline label. Selecting it is not a mutation — it only updates
 * caller-owned form state. Works identically on web and native.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  testID,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  testID?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.checkRow, pressed && styles.buttonPressed]}
    >
      <View
        style={[styles.checkBox, checked && styles.checkBoxOn, disabled && styles.checkBoxOff]}
        {...webAnim}
      >
        {checked ? <AppIcon name="check-bold" size={14} color={colors.white} /> : null}
      </View>
      {label ? <Text style={styles.checkLabel}>{label}</Text> : null}
    </Pressable>
  );
}

/**
 * A pill switch with an animated knob and an optional inline label. Toggling it is caller-owned
 * local state, never a direct mutation. The knob glides via the global `[data-anim]` web transition.
 */
export function Toggle({
  value,
  onValueChange,
  label,
  description,
  testID,
  disabled,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label?: string;
  description?: string;
  testID?: string;
  disabled?: boolean;
}) {
  const body = (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [styles.toggleControl, pressed && styles.buttonPressed]}
    >
      <View
        style={[
          styles.toggleTrack,
          value && styles.toggleTrackOn,
          disabled && styles.toggleDisabled,
        ]}
        {...webAnim}
      >
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} {...webAnim} />
      </View>
    </Pressable>
  );
  if (!label && !description) return body;
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        {label ? <Text style={styles.toggleLabel}>{label}</Text> : null}
        {description ? <Text style={styles.toggleDescription}>{description}</Text> : null}
      </View>
      {body}
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
  const { t } = useI18n();
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
          armed && styles.buttonDangerArmed,
          disabled && styles.buttonDisabled,
          pressed && styles.buttonPressed,
        ]}
      >
        <AppIcon
          name={armed ? "alert-outline" : "trash-can-outline"}
          size={18}
          color={colors.white}
        />
        <Text style={styles.buttonText}>{armed ? confirmLabel : label}</Text>
      </Pressable>
      {armed ? <TextButton label={t("common.cancel")} onPress={() => setArmed(false)} /> : null}
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
  required,
  error,
}: {
  label: string;
  options: SelectOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  testIDPrefix?: string;
  emptyLabel?: string;
  required?: boolean;
  error?: string | null;
}) {
  const { isRTL, dir } = useI18n();
  return (
    <View style={[styles.field, { direction: dir }]}>
      <FieldLabel label={label} required={required} />
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
                <View style={[styles.optionRadio, isSelected && styles.optionRadioOn]} {...webAnim}>
                  {isSelected ? <View style={styles.optionRadioDot} /> : null}
                </View>
                <Text
                  style={[
                    styles.optionText,
                    readingDirection(isRTL),
                    isSelected && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <FieldError message={error} testID={testIDPrefix ? `${testIDPrefix}-error` : undefined} />
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  neutral: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  brand: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoftStrong },
  success: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  warning: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
});

const badgeTextStyles = StyleSheet.create({
  neutral: { color: colors.inkMuted },
  brand: { color: colors.brand },
  success: { color: colors.success },
  warning: { color: colors.warning },
  danger: { color: colors.danger },
});

const badgeDotColor = {
  neutral: colors.inkSubtle,
  brand: colors.brand,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
} as const;

const surfaceToneStyles = StyleSheet.create({
  default: { backgroundColor: colors.surface },
  muted: { backgroundColor: colors.surfaceMuted },
  brand: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoftStrong },
  accent: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
});

const noticeStyles = StyleSheet.create({
  info: { backgroundColor: colors.infoSoft, borderColor: "#CFE0F0" },
  success: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  warning: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
});

const noticeInk = {
  info: colors.info,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
} as const;

const noticeIconBg = {
  info: "#DCE8F4",
  success: "#D3E7DA",
  warning: "#EFE0C4",
  danger: "#F3D6CC",
} as const;

export const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  scrollContent: {
    alignItems: "center",
    padding: spacing.xl,
    paddingBottom: layout.navigationClearance + spacing.xl,
  },
  scrollContentWithAction: { paddingBottom: layout.navigationClearance + 96 },
  page: { width: "100%", maxWidth: layout.contentMaxWidth, gap: spacing.lg },
  pageWide: { maxWidth: layout.wideContentMaxWidth },
  persistentActionLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: layout.navigationClearance + spacing.sm,
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  persistentActionContent: { width: "100%", maxWidth: layout.contentMaxWidth },
  persistentActionContentWide: { maxWidth: layout.wideContentMaxWidth },
  actionDock: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
    ...shadows.raised,
  },
  actionDockButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  actionDockButtonPrimary: { backgroundColor: colors.brand },
  actionDockLabel: { color: colors.brand, fontSize: 12, fontWeight: "800" },
  actionDockLabelPrimary: { color: colors.white },
  pageHeader: { gap: spacing.md, marginBottom: spacing.sm },
  pageHeaderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  pageHeaderMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  pageHeaderBack: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandSoftStrong,
  },
  pageHeaderCopy: { flex: 1, minWidth: 0, alignItems: "stretch", gap: 3 },
  pageHeaderMeta: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pageHeaderDescription: {
    width: "100%",
    maxWidth: 640,
    color: colors.inkMuted,
    ...typography.body,
  },
  pageHeaderAction: {
    maxWidth: "100%",
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    padding: 4,
    backgroundColor: colors.surfaceRaised,
    ...shadows.card,
  },
  pageHeaderRule: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pageHeaderRuleAccent: {
    width: 44,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  pageHeaderRuleLine: { flex: 1, height: 1, backgroundColor: colors.borderSoft },
  surface: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
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
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandSoftStrong,
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
  noticeIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  noticeCopy: { flex: 1, gap: spacing.xs },
  noticeTitle: { ...typography.cardTitle },
  noticeMessage: { ...typography.body },
  noticeAction: { marginTop: spacing.xs },
  searchField: {
    minHeight: 52,
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
    minHeight: 40,
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
    ...shadows.card,
  },
  metricIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
    marginBottom: spacing.xs,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  metricLabel: { color: colors.inkMuted, ...typography.caption },
  summaryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  summaryMetric: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  summaryMetricIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  summaryMetricCopy: { flex: 1, minWidth: 0, gap: 1 },
  summaryMetricValue: { color: colors.ink, fontSize: 18, lineHeight: 23, fontWeight: "800" },
  summaryMetricLabel: { color: colors.inkMuted, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  responsiveList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  responsiveListItem: { width: "100%" },
  responsiveListItemWide: { width: "48.8%", flexGrow: 1 },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
  },
  badgeDot: { width: 6, height: 6, borderRadius: radius.pill },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
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
  rowInteractive: {},
  rowContent: { flex: 1, gap: spacing.sm },
  rowCompact: { minHeight: 62, padding: spacing.md, borderRadius: radius.md },
  rowContentCompact: { gap: spacing.xs },
  rowPressed: { opacity: 0.9, transform: [{ scale: 0.992 }] },
  card: {
    width: "100%",
    maxWidth: 460,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.xxl,
    gap: spacing.lg,
    ...shadows.raised,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: { color: colors.ink, ...typography.sectionTitle },
  pageTitle: { width: "100%", flexShrink: 1, color: colors.ink, ...typography.pageTitle },
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
    minHeight: 52,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    ...shadows.card,
  },
  buttonSecondary: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandSoftStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonPressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDangerArmed: { backgroundColor: colors.accentStrong },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  buttonTextSecondary: { color: colors.brand },
  headerButton: {
    width: 42,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    ...shadows.card,
  },
  headerButtonSecondary: {
    borderWidth: 1,
    borderColor: colors.brandSoftStrong,
    backgroundColor: colors.brandSoft,
    shadowOpacity: 0,
    elevation: 0,
  },
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
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  infoLabel: { color: colors.inkMuted, fontSize: 14, fontWeight: "600" },
  infoValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionHeadingMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionMarker: {
    width: 4,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
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
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandSoftStrong,
  },
  emptyTitle: { color: colors.ink, ...typography.pageTitle, textAlign: "center" },
  emptyMessage: {
    maxWidth: 380,
    color: colors.inkMuted,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 23,
    textAlign: "center",
  },
  emptyAction: { width: "100%", maxWidth: 280, marginTop: spacing.sm },
  field: { gap: spacing.sm },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  requiredMark: { color: colors.danger, fontWeight: "800" },
  fieldError: { flexDirection: "row", alignItems: "center", gap: 6 },
  fieldErrorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  fieldHint: { color: colors.inkSubtle, fontSize: 12, fontWeight: "500", lineHeight: 17 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surfaceRaised,
  },
  inputDisabled: { backgroundColor: colors.surfaceMuted, color: colors.inkSubtle },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  checkBox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  checkBoxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkBoxOff: { opacity: 0.5 },
  checkLabel: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "600" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  toggleCopy: { flex: 1, gap: 2 },
  toggleLabel: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  toggleDescription: { color: colors.inkMuted, ...typography.caption },
  toggleControl: { padding: 2 },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    padding: 3,
    justifyContent: "center",
  },
  toggleTrackOn: { backgroundColor: colors.brand },
  toggleDisabled: { opacity: 0.5 },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    ...shadows.card,
  },
  toggleKnobOn: { transform: [{ translateX: 20 }] },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  optionDisabled: { opacity: 0.45 },
  optionRadio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  optionRadioOn: { borderColor: colors.brand },
  optionRadioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  optionText: { flex: 1, color: colors.inkMuted, fontSize: 15, fontWeight: "600" },
  optionTextSelected: { color: colors.brand, fontWeight: "800" },
});

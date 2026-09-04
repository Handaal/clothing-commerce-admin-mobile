import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

/** A vertically scrolling variant of {@link Screen}, for list and detail surfaces. */
export function ScrollScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageHeader({
  title,
  eyebrow,
  onBack,
}: {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
}) {
  return (
    <View style={styles.pageHeader}>
      {onBack ? <TextButton label="‹ Back" onPress={onBack} /> : null}
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Title>{title}</Title>
    </View>
  );
}

/** A small, non-interactive status pill (e.g. a product/variant status). */
export function Badge({ label, testID }: { label: string; testID?: string }) {
  return (
    <View style={styles.badge}>
      <Text testID={testID} style={styles.badgeText}>
        {label}
      </Text>
    </View>
  );
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
      style={({ pressed }) => [styles.row, pressed && styles.buttonPressed]}
    >
      {children}
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

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <View style={styles.loadingRow}>
      <ActivityIndicator color="#6d28d9" />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.textButton}>
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
        placeholderTextColor="#a1a1aa"
      />
    </View>
  );
}

/** A labelled single-line free-text input (used for the optional operator note). */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#a1a1aa"
      />
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

export const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f3ff" },
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scrollContent: { alignItems: "center", padding: 24 },
  pageHeader: { gap: 8 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#ede9fe",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeText: {
    color: "#5b21b6",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  row: {
    borderWidth: 1,
    borderColor: "#ede9fe",
    borderRadius: 16,
    padding: 16,
    gap: 8,
    backgroundColor: "#ffffff",
  },
  card: {
    width: "100%",
    maxWidth: 620,
    borderWidth: 1,
    borderColor: "#ddd6fe",
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 32,
    gap: 16,
    shadowColor: "#5b21b6",
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  eyebrow: {
    color: "#6d28d9",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: { color: "#2e1065", fontSize: 28, fontWeight: "700", lineHeight: 34 },
  body: { color: "#5b556b", fontSize: 15, fontWeight: "500", lineHeight: 22 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  button: {
    backgroundColor: "#6d28d9",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { backgroundColor: "#c4b5fd" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  textButton: { paddingVertical: 8 },
  textButtonLabel: { color: "#6d28d9", fontSize: 15, fontWeight: "700" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 6,
  },
  infoLabel: { color: "#6b7280", fontSize: 14, fontWeight: "600" },
  infoValue: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  divider: { height: 1, backgroundColor: "#ede9fe", marginVertical: 4 },
  field: { gap: 6 },
  fieldLabel: { color: "#6b7280", fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd6fe",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  inputDisabled: { backgroundColor: "#f4f4f5", color: "#a1a1aa" },
  option: {
    borderWidth: 1,
    borderColor: "#ede9fe",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
  },
  optionSelected: { borderColor: "#6d28d9", backgroundColor: "#ede9fe" },
  optionDisabled: { opacity: 0.5 },
  optionText: { color: "#3f3f46", fontSize: 15, fontWeight: "600" },
  optionTextSelected: { color: "#5b21b6", fontWeight: "700" },
});

import {
  buildSiteTextRequest,
  defaultSiteTextList,
  isSiteTextFormDirty,
  SITE_TEXT_FIELDS,
  SITE_TEXT_GROUPS,
  siteTextIssueMessage,
  siteTextPlaceholder,
  siteTextToForm,
  validateSiteTextForm,
  type SiteText,
  type SiteTextFaqItem,
  type SiteTextForm,
  type SiteTextIssues,
  type SiteTextLanguage,
  type SiteTextListKey,
  type SiteTextSection,
  type SiteTextTextKey,
  type StorefrontSiteText,
  type TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { errorHeading, isRetryable } from "../products/display";
import { describePromotionWriteError } from "../promotions/write-errors";
import {
  FieldError,
  FormSection,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  TextButton,
  TextField,
} from "../ui/components";
import { radius, spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useToast } from "../ui/Toast";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";

export type SiteTextClient = Pick<
  TenantCommerceClient,
  "getStorefrontSiteText" | "updateStorefrontSiteText"
>;

const GROUP_ICONS: Record<string, React.ComponentProps<typeof FormSection>["icon"]> = {
  identity: "storefront-outline",
  promo: "bullhorn-outline",
  home: "home-outline",
  brand: "text-box-outline",
  footer: "page-layout-footer",
  contact: "phone-outline",
  faq: "frequently-asked-questions",
  terms: "file-document-outline",
  shipping: "truck-delivery-outline",
};

/**
 * Site text (SDK 0.52): every piece of website copy outside the catalog and the home hero — promo bar,
 * home section titles, brand note, sign-up box, footer, search title/description, contact details and
 * the FAQ / Terms / Shipping & returns pages. The fields, their limits and their labels come from the
 * SDK (shared with the POS Website desk), so both apps edit exactly the same document. A blank field
 * shows (and keeps) the website's built-in text. Authorized by catalog.author (the API enforces it).
 */
export function SiteTextScreen({
  client,
  canManage,
  onBack,
  generateIdempotencyKey = secureIdempotencyKey,
}: {
  client: SiteTextClient;
  canManage: boolean;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  const header = (
    <PageHeader
      eyebrow={t("storefront.title")}
      title={t("siteText.title")}
      icon="format-text"
      onBack={onBack}
    />
  );
  if (!canManage) {
    return (
      <ScrollScreen>
        {header}
        <Notice
          tone="warning"
          title={t("siteText.accessTitle")}
          message={t("siteText.accessBody")}
        />
      </ScrollScreen>
    );
  }
  return (
    <SiteTextLoader
      header={header}
      client={client}
      generateIdempotencyKey={generateIdempotencyKey}
    />
  );
}

/** Loads only once access is known, so a role without catalog access never calls the API. */
function SiteTextLoader({
  header,
  client,
  generateIdempotencyKey,
}: {
  header: React.ReactNode;
  client: SiteTextClient;
  generateIdempotencyKey: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  const load = useCallback(() => client.getStorefrontSiteText(), [client]);
  const { state, reload } = useAsync<StorefrontSiteText>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        {header}
        <LoadingBlock label={t("siteText.loading")} />
      </ScrollScreen>
    );
  }
  if (state.status === "error") {
    return (
      <ScrollScreen>
        {header}
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <TextButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      </ScrollScreen>
    );
  }
  return (
    <SiteTextEditor
      header={header}
      initial={state.data.siteText}
      client={client}
      generateIdempotencyKey={generateIdempotencyKey}
    />
  );
}

function SiteTextEditor({
  header,
  initial,
  client,
  generateIdempotencyKey,
}: {
  header: React.ReactNode;
  initial: SiteText;
  client: SiteTextClient;
  generateIdempotencyKey: IdempotencyKeyFactory;
}) {
  const { t, locale } = useI18n();
  const lang: SiteTextLanguage = locale === "ar" ? "ar" : "en";
  const toast = useToast();
  const [saved, setSaved] = useState<SiteTextForm>(() => siteTextToForm(initial));
  const [form, setForm] = useState<SiteTextForm>(saved);
  const [issues, setIssues] = useState<SiteTextIssues>({});

  const producer = useCallback(
    (siteText: SiteText, idempotencyKey: string) =>
      client.updateStorefrontSiteText({ siteText, idempotencyKey }),
    [client],
  );
  const mutation = useMutation(producer, generateIdempotencyKey, {
    onSuccess: (result) => {
      const next = siteTextToForm(result.siteText);
      setSaved(next);
      setForm(next);
      toast.success(t("siteText.savedToast"), { title: t("siteText.savedTitle") });
      mutation.reset();
    },
    onError: (error) => {
      const described = describePromotionWriteError(error);
      toast.error(described.message, { title: described.heading });
    },
  });

  function setText(key: SiteTextTextKey, value: string) {
    setForm((current) => ({ ...current, texts: { ...current.texts, [key]: value } }));
    setIssues((current) => ({ ...current, [key]: undefined }));
  }
  function setList<K extends SiteTextListKey>(key: K, value: SiteTextForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setIssues((current) => ({ ...current, [key]: undefined }));
  }

  function save() {
    const next = validateSiteTextForm(form);
    setIssues(next);
    if (Object.values(next).some(Boolean)) {
      toast.error(t("common.fixHighlightedSave"));
      return;
    }
    mutation.submit(buildSiteTextRequest(form));
  }

  const saving = mutation.state.status === "submitting";
  const dirty = isSiteTextFormDirty(form, saved);
  const issueText = (key: SiteTextTextKey | SiteTextListKey) => {
    const issue = issues[key];
    return issue ? siteTextIssueMessage(issue, lang) : null;
  };

  return (
    <ScrollScreen>
      {header}
      <Notice message={t("siteText.intro")} />

      {SITE_TEXT_GROUPS.map((group) => (
        <FormSection
          key={group.id}
          title={group.label[lang]}
          icon={GROUP_ICONS[group.id]}
          testID={`site-text-group-${group.id}`}
        >
          {group.fields.map((key) => {
            const def = SITE_TEXT_FIELDS[key];
            if (def.kind === "messages" || def.kind === "faq" || def.kind === "sections") {
              const listKey = key as SiteTextListKey;
              return (
                <ListField
                  key={key}
                  fieldKey={listKey}
                  label={def.label[lang]}
                  hint={def.hint?.[lang]}
                  value={form[listKey]}
                  onChange={(value) => setList(listKey, value as never)}
                  error={issueText(listKey)}
                />
              );
            }
            const textKey = key as SiteTextTextKey;
            return (
              <TextField
                key={key}
                label={def.label[lang]}
                value={form.texts[textKey]}
                onChangeText={(value) => setText(textKey, value)}
                placeholder={siteTextPlaceholder(textKey, form) || undefined}
                multiline={def.kind === "multiline"}
                numeric={def.kind === "phone"}
                autoCapitalize={def.kind === "email" || def.kind === "link" ? "none" : undefined}
                hint={def.hint?.[lang]}
                error={issueText(textKey)}
                testID={`site-text-${key}`}
              />
            );
          })}
        </FormSection>
      ))}

      <PrimaryButton
        label={saving ? t("siteText.saving") : t("siteText.save")}
        icon="content-save-outline"
        disabled={saving || !dirty}
        testID="site-text-save"
        onPress={save}
      />
      {dirty ? <Text style={plain.unsaved}>{t("siteText.unsaved")}</Text> : null}
    </ScrollScreen>
  );
}

type ListValue = string[] | SiteTextFaqItem[] | SiteTextSection[] | null;

/** A list field: "built-in" until the owner chooses to customize; then add / edit / reorder / remove. */
function ListField({
  fieldKey,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  fieldKey: SiteTextListKey;
  label: string;
  hint?: string | undefined;
  value: ListValue;
  onChange: (value: ListValue) => void;
  error: string | null;
}) {
  const { t } = useI18n();
  const { styles } = useStyles();
  const kind = SITE_TEXT_FIELDS[fieldKey].kind;
  const max = SITE_TEXT_FIELDS[fieldKey].max;

  if (value === null) {
    return (
      <View style={styles.list} testID={`site-text-${fieldKey}`}>
        <Text style={styles.listLabel}>{label}</Text>
        <Text style={styles.listHint}>{t("siteText.usingBuiltIn")}</Text>
        {hint ? <Text style={styles.listHint}>{hint}</Text> : null}
        <TextButton
          label={t("siteText.customize")}
          icon="pencil-outline"
          testID={`site-text-${fieldKey}-customize`}
          onPress={() => onChange(defaultSiteTextList(fieldKey) as ListValue)}
        />
      </View>
    );
  }

  const items = value as unknown[];
  const replace = (index: number, item: unknown) =>
    onChange(items.map((current, i) => (i === index ? item : current)) as ListValue);
  const move = (index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next as ListValue);
  };
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index) as ListValue);
  const add = () =>
    onChange([
      ...items,
      kind === "messages"
        ? ""
        : kind === "faq"
          ? { question: "", answer: "" }
          : { heading: "", body: "" },
    ] as ListValue);

  return (
    <View style={styles.list} testID={`site-text-${fieldKey}`}>
      <Text style={styles.listLabel}>{label}</Text>
      {hint ? <Text style={styles.listHint}>{hint}</Text> : null}
      {items.length === 0 ? (
        <Text style={styles.listHint}>
          {kind === "messages" ? t("siteText.emptyPromo") : t("siteText.emptyList")}
        </Text>
      ) : null}
      {items.map((item, index) => (
        <View key={index} style={styles.item} testID={`site-text-${fieldKey}-item-${index}`}>
          {kind === "messages" ? (
            <TextField
              label={t("siteText.message", { n: index + 1 })}
              value={item as string}
              onChangeText={(v) => replace(index, v)}
              testID={`site-text-${fieldKey}-${index}`}
            />
          ) : kind === "faq" ? (
            <>
              <TextField
                label={t("siteText.question", { n: index + 1 })}
                value={(item as SiteTextFaqItem).question}
                onChangeText={(v) => replace(index, { ...(item as SiteTextFaqItem), question: v })}
                testID={`site-text-${fieldKey}-${index}-a`}
              />
              <TextField
                label={t("siteText.answer")}
                value={(item as SiteTextFaqItem).answer}
                onChangeText={(v) => replace(index, { ...(item as SiteTextFaqItem), answer: v })}
                multiline
                testID={`site-text-${fieldKey}-${index}-b`}
              />
            </>
          ) : (
            <>
              <TextField
                label={t("siteText.heading", { n: index + 1 })}
                value={(item as SiteTextSection).heading}
                onChangeText={(v) => replace(index, { ...(item as SiteTextSection), heading: v })}
                testID={`site-text-${fieldKey}-${index}-a`}
              />
              <TextField
                label={t("siteText.body")}
                value={(item as SiteTextSection).body}
                onChangeText={(v) => replace(index, { ...(item as SiteTextSection), body: v })}
                multiline
                testID={`site-text-${fieldKey}-${index}-b`}
              />
            </>
          )}
          <View style={styles.itemActions}>
            <TextButton
              label={t("siteText.moveUp")}
              icon="arrow-up"
              onPress={() => move(index, -1)}
              testID={`site-text-${fieldKey}-${index}-up`}
            />
            <TextButton
              label={t("siteText.moveDown")}
              icon="arrow-down"
              onPress={() => move(index, 1)}
              testID={`site-text-${fieldKey}-${index}-down`}
            />
            <TextButton
              label={t("siteText.remove")}
              icon="trash-can-outline"
              onPress={() => remove(index)}
              testID={`site-text-${fieldKey}-${index}-remove`}
            />
          </View>
        </View>
      ))}
      <FieldError message={error} testID={`site-text-${fieldKey}-error`} />
      <View style={styles.itemActions}>
        {items.length < max ? (
          <TextButton
            label={t("siteText.add")}
            icon="plus"
            onPress={add}
            testID={`site-text-${fieldKey}-add`}
          />
        ) : null}
        <TextButton
          label={t("siteText.useBuiltIn")}
          icon="restore"
          onPress={() => onChange(null)}
          testID={`site-text-${fieldKey}-reset`}
        />
      </View>
    </View>
  );
}

const plain = StyleSheet.create({
  unsaved: { ...typography.caption, textAlign: "center", marginTop: spacing.sm, opacity: 0.7 },
});

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    list: { gap: spacing.sm, paddingVertical: spacing.sm },
    listLabel: { ...typography.label, color: colors.ink },
    listHint: { ...typography.caption, color: colors.inkMuted },
    item: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    itemActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  });
  return { colors, styles };
});

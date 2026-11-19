import type { MeContextResponse, SubscriberListResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  Surface,
  TextButton,
} from "../ui/components";
import { spacing, typography } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { createThemedStyles } from "../ui/useTheme";

export interface SubscribersScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onBack: () => void;
}

/** One address per line, for pasting into an email tool. */
export function subscribersAsText(list: SubscriberListResponse): string {
  return list.subscribers.map((subscriber) => subscriber.email).join("\n");
}

/**
 * Website → Sign-ups (SDK 0.47): emails left in the website's "drop alerts" form, newest first.
 * Read-only; shown to staff who can read orders (customer contacts). Sending emails happens in the
 * brand's own email tool — "Share list" hands the addresses to it.
 */
export function SubscribersScreen({ tenantId, context, onBack }: SubscribersScreenProps) {
  const { t, locale } = useI18n();
  const { styles } = useStyles();
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const canRead = context.access.orders.canRead;
  const load = useCallback(
    () =>
      canRead
        ? client.listSubscribers({ limit: 1000 })
        : Promise.resolve<SubscriberListResponse>({ subscribers: [], total: 0 }),
    [client, canRead],
  );
  const { state, reload, refresh, refreshing } = useAsync<SubscriberListResponse>(load);
  const [shareFailed, setShareFailed] = useState(false);

  if (!canRead) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow={t("subs.eyebrow")} title={t("subs.title")} onBack={onBack} />
        <Notice tone="warning" title={t("subs.accessTitle")} message={t("subs.accessBody")} />
      </ScrollScreen>
    );
  }

  async function share(list: SubscriberListResponse) {
    setShareFailed(false);
    try {
      await Share.share({ message: subscribersAsText(list), title: t("subs.title") });
    } catch {
      setShareFailed(true);
    }
  }

  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <ScrollScreen onRefresh={refresh} refreshing={refreshing}>
      <PageHeader
        eyebrow={t("subs.eyebrow")}
        title={t("subs.title")}
        description={t("subs.desc")}
        icon="email-newsletter"
        onBack={onBack}
      />
      {state.status === "loading" ? <LoadingBlock label={t("subs.loading")} /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <TextButton label={t("common.retry")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" ? (
        <>
          <Surface style={styles.summary}>
            <Text style={styles.total} testID="subs-total">
              {state.data.total}
            </Text>
            <Text style={styles.totalLabel}>{t("subs.totalLabel")}</Text>
            {state.data.subscribers.length > 0 ? (
              <PrimaryButton
                variant="secondary"
                label={t("subs.share")}
                icon="share-variant-outline"
                testID="subs-share"
                onPress={() => void share(state.data)}
              />
            ) : null}
            {shareFailed ? <Notice tone="warning" message={t("subs.shareFailed")} /> : null}
          </Surface>
          {state.data.subscribers.length === 0 ? (
            <Notice message={t("subs.empty")} testID="subs-empty" />
          ) : (
            <>
              <SectionHeading
                title={t("subs.listTitle")}
                detail={
                  state.data.total > state.data.subscribers.length
                    ? t("subs.showing", { count: state.data.subscribers.length })
                    : undefined
                }
              />
              <Surface tone="muted" style={styles.list}>
                {state.data.subscribers.map((subscriber, index) => (
                  <View
                    key={subscriber.id}
                    style={[styles.row, index > 0 && styles.rowDivider]}
                    testID={`subs-row-${index}`}
                  >
                    <Text style={styles.email} selectable numberOfLines={1}>
                      {subscriber.email}
                    </Text>
                    <Text style={styles.meta}>
                      {dateFormat.format(new Date(subscriber.createdAt))}
                    </Text>
                  </View>
                ))}
              </Surface>
            </>
          )}
        </>
      ) : null}
    </ScrollScreen>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    summary: { gap: spacing.sm, alignItems: "flex-start" },
    total: { color: colors.ink, ...typography.display },
    totalLabel: { color: colors.inkMuted, ...typography.body },
    list: { paddingVertical: spacing.xs, shadowOpacity: 0, elevation: 0 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    email: { flex: 1, color: colors.ink, ...typography.body },
    meta: { color: colors.inkMuted, ...typography.caption },
  });
  return { styles };
});

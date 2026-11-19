import type { OrderDetailResponse } from "@shifted/clothing-commerce-sdk";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { getStorefrontPublicUrl } from "../config/env";
import { useI18n } from "../i18n";
import { Notice, PrimaryButton, SectionHeading, Surface } from "../ui/components";
import { spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { confirmationLinks } from "./customer-message";

/**
 * Online order → "Message the customer" (Phase 4). Opens WhatsApp or the Messages app on this device
 * with an order confirmation filled in (in the app's language); staff press send. Free, nothing is sent
 * by a server, and nothing is recorded.
 */
export function CustomerMessage({
  detail,
  storeName,
  openUrl = (url: string) => Linking.openURL(url),
}: {
  detail: OrderDetailResponse;
  storeName: string;
  openUrl?: (url: string) => Promise<unknown>;
}) {
  const { t, locale } = useI18n();
  const { styles } = useStyles();
  const [failed, setFailed] = useState(false);
  const links = confirmationLinks(detail, {
    storeName,
    language: locale === "ar" ? "ar" : "en",
    storefrontUrl: getStorefrontPublicUrl(),
  });
  if (!links) return null;

  async function open(url: string) {
    setFailed(false);
    try {
      await openUrl(url);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Surface testID="order-customer-message">
      <SectionHeading title={t("orderMessage.title")} detail={t("orderMessage.detail")} />
      <Text style={styles.preview} selectable testID="order-message-preview">
        {links.text}
      </Text>
      <View style={styles.actions}>
        {links.whatsApp ? (
          <PrimaryButton
            label={t("orderMessage.whatsApp")}
            icon="whatsapp"
            testID="order-message-whatsapp"
            onPress={() => void open(links.whatsApp!)}
          />
        ) : null}
        {links.sms ? (
          <PrimaryButton
            variant="secondary"
            label={t("orderMessage.sms")}
            icon="message-text-outline"
            testID="order-message-sms"
            onPress={() => void open(links.sms!)}
          />
        ) : null}
      </View>
      {failed ? <Notice tone="warning" message={t("orderMessage.openFailed")} /> : null}
    </Surface>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    preview: {
      color: colors.inkMuted,
      ...typography.body,
      padding: spacing.md,
      borderRadius: 12,
      backgroundColor: colors.surfaceMuted,
    },
    actions: { gap: spacing.sm },
  });
  return { styles };
});

import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { promotionCapabilities } from "../promotions/capabilities";
import { resolveSettingsAdapter } from "../settings/adapter";
import { settingsCapabilities } from "../settings/capabilities";
import type { CommerceSettings } from "../settings/model";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  InfoRow,
  LoadingBlock,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  Surface,
  TextButton,
} from "../ui/components";
import { AppIcon, type AppIconName } from "../ui/Icon";
import { colors, radius, spacing, typography } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { errorHeading, isRetryable } from "../products/display";

export interface StorefrontScreenProps {
  tenantId: string;
  context: MeContextResponse;
  /** Opens the canonical checkout/returns editor (Settings → Commerce). */
  onManageCheckout: () => void;
  onOpenProducts: () => void;
  onOpenPromotions: () => void;
  onBack: () => void;
}

/**
 * Storefront control center. The customer-facing website has no CMS/theme API — its live content is
 * the published catalog, the per-brand checkout settings, and the promotions applied at checkout.
 * This hub surfaces the current checkout configuration (authenticated read) and routes into the
 * existing, capability-authorized editors for everything the Commerce API actually controls. It never
 * invents a page/banner editor the contract does not provide. The API still authorizes every read and
 * write independently; capability flags here only guide navigation.
 */
export function StorefrontScreen({
  tenantId,
  context,
  onManageCheckout,
  onOpenProducts,
  onOpenPromotions,
  onBack,
}: StorefrontScreenProps) {
  const { t } = useI18n();
  const settings = settingsCapabilities(context);
  const promotions = promotionCapabilities(context);
  const canReadCatalog = context.access.catalog.canRead;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("storefront.eyebrow")}
        title={t("storefront.title")}
        description={t("storefront.headerDesc")}
        icon="storefront-outline"
        onBack={onBack}
      />

      <Surface tone="brand" style={styles.intro}>
        <Text style={styles.introTitle}>{t("storefront.introTitle")}</Text>
        <Text style={styles.introBody}>{t("storefront.introBody")}</Text>
      </Surface>

      <SectionHeading title={t("storefront.checkoutTitle")} />
      <Body>{t("storefront.checkoutBody")}</Body>
      {settings.canRead ? (
        <CheckoutConfig
          tenantId={tenantId}
          canManage={settings.canManage}
          onManage={onManageCheckout}
        />
      ) : (
        <Notice tone="warning" message={t("storefront.checkoutNoAccess")} />
      )}

      <SectionHeading title={t("storefront.manageHeading")} />
      <View style={styles.cards}>
        {canReadCatalog ? (
          <WebsiteCard
            testID="storefront-open-products"
            icon="tag-multiple-outline"
            title={t("storefront.catalogTitle")}
            body={t("storefront.catalogBody")}
            onPress={onOpenProducts}
          />
        ) : null}
        {promotions.canRead ? (
          <WebsiteCard
            testID="storefront-open-promotions"
            icon="ticket-percent-outline"
            title={t("storefront.promotionsTitle")}
            body={t("storefront.promotionsBody")}
            onPress={onOpenPromotions}
          />
        ) : null}
        {settings.canRead ? (
          <WebsiteCard
            testID="storefront-open-returns"
            icon="backup-restore"
            title={t("storefront.returnsTitle")}
            body={t("storefront.returnsBody")}
            onPress={onManageCheckout}
          />
        ) : null}
      </View>
    </ScrollScreen>
  );
}

function CheckoutConfig({
  tenantId,
  canManage,
  onManage,
}: {
  tenantId: string;
  canManage: boolean;
  onManage: () => void;
}) {
  const { getTenantClient } = useSession();
  const { t } = useI18n();
  const load = useCallback(
    () => resolveSettingsAdapter(getTenantClient(tenantId)).getCommerce(),
    [getTenantClient, tenantId],
  );
  const { state, reload } = useAsync<CommerceSettings>(load);

  if (state.status === "loading") return <LoadingBlock label={t("storefront.loading")} />;
  if (state.status === "error") {
    return (
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
    );
  }

  const storefronts = state.data.storefronts;
  return (
    <View style={styles.config}>
      {storefronts.length ? (
        storefronts.map((storefront) => (
          <Surface key={storefront.brandId} style={styles.brandCard} testID={`storefront-brand-${storefront.brandId}`}>
            <View style={styles.brandHead}>
              <Text style={styles.brandName}>{storefront.brandName}</Text>
              <Badge
                label={storefront.codEnabled ? t("set.enabled") : t("set.disabled")}
                tone={storefront.codEnabled ? "success" : "neutral"}
              />
            </View>
            <InfoRow label={t("set.currency")} value={storefront.currency} />
            <InfoRow
              label={t("set.fulfillmentInvLocation")}
              value={storefront.fulfillmentInventoryLocationId}
            />
            <InfoRow
              label={t("set.codShort")}
              value={storefront.codEnabled ? t("set.enabled") : t("set.disabled")}
            />
          </Surface>
        ))
      ) : (
        <Notice message={t("storefront.noCheckout")} />
      )}
      {canManage ? (
        <PrimaryButton
          label={t("storefront.manageCheckout")}
          icon="cog-outline"
          variant="secondary"
          testID="storefront-manage-checkout"
          onPress={onManage}
        />
      ) : null}
    </View>
  );
}

function WebsiteCard({
  testID,
  icon,
  title,
  body,
  onPress,
}: {
  testID: string;
  icon: AppIconName;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <PressableRow testID={testID} onPress={onPress}>
      <View style={styles.cardRow}>
        <View style={styles.iconTile}>
          <AppIcon name={icon} size={24} color={colors.brand} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardBody}>{body}</Text>
        </View>
      </View>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm },
  introTitle: { color: colors.ink, ...typography.sectionTitle },
  introBody: { color: colors.inkMuted, ...typography.body },
  config: { gap: spacing.md },
  brandCard: { gap: 6 },
  brandHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandName: { color: colors.ink, ...typography.cardTitle },
  cards: { gap: spacing.md },
  cardRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconTile: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  cardCopy: { flex: 1, gap: 3 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  cardBody: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, fontWeight: "500" },
});

import type {
  CollectionListResponse,
  ProductListResponse,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import { loadAllPromotionProducts } from "../promotions/load";
import {
  Body,
  Checkbox,
  FieldError,
  LoadingBlock,
  Notice,
  SearchField,
  SurfaceRow,
  TextButton,
} from "../ui/components";
import { spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useAsync, type AsyncState } from "../ui/useAsync";

export type ProductItem = ProductListResponse["items"][number];
export type CollectionItem = CollectionListResponse["collections"][number];

const VISIBLE_RESULTS = 40;

/** Loads every catalog product once (cursor-complete), shared by the merchandising editors. */
export function useCatalogProducts(client: Pick<TenantCommerceClient, "listProducts">) {
  const load = useCallback(() => loadAllPromotionProducts(client), [client]);
  return useAsync<ProductItem[]>(load);
}

export function useCatalogCollections(client: Pick<TenantCommerceClient, "listCollections">) {
  const load = useCallback(async () => (await client.listCollections()).collections, [client]);
  return useAsync<CollectionItem[]>(load);
}

/**
 * Searchable multi-select over catalog items. When `ordered`, the selection order is the display
 * order on the website, and each pick can be moved up or removed. Picking is local form state only.
 */
export function MultiPicker<T extends { id: string; name: string }>({
  items,
  selected,
  onChange,
  ordered = false,
  max,
  describe,
  error,
  testIDPrefix,
}: {
  items: T[];
  selected: string[];
  onChange: (next: string[]) => void;
  ordered?: boolean;
  max?: number;
  describe?: (item: T) => string | null;
  error?: string;
  testIDPrefix: string;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const matches = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return items
      .filter((item) => !term || item.name.toLocaleLowerCase().includes(term))
      .slice(0, VISIBLE_RESULTS);
  }, [items, search]);
  const full = max !== undefined && selected.length >= max;

  function toggle(id: string, next: boolean) {
    if (next) {
      if (!selected.includes(id) && !full) onChange([...selected, id]);
    } else {
      onChange(selected.filter((value) => value !== id));
    }
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...selected];
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
    onChange(next);
  }

  return (
    <View style={styles.wrap}>
      {ordered && selected.length > 0 ? (
        <View style={styles.selected}>
          <Text style={styles.caption}>
            {t("merch.selectedOrder", { count: selected.length, max: max ?? selected.length })}
          </Text>
          {selected.map((id, index) => (
            <SurfaceRow key={id} testID={`${testIDPrefix}-selected-${id}`}>
              <View style={styles.selectedRow}>
                <Text style={styles.position}>{index + 1}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {byId.get(id)?.name ?? t("merch.unavailableItem")}
                </Text>
                {index > 0 ? (
                  <TextButton
                    label={t("merch.moveUp")}
                    icon="arrow-up"
                    onPress={() => moveUp(index)}
                  />
                ) : null}
                <TextButton label={t("merch.remove")} onPress={() => toggle(id, false)} />
              </View>
            </SurfaceRow>
          ))}
        </View>
      ) : null}
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={t("merch.searchPlaceholder")}
        testID={`${testIDPrefix}-search`}
      />
      {full ? <Body>{t("merch.limitReached", { max: max ?? 0 })}</Body> : null}
      {matches.length === 0 ? <Body>{t("merch.noMatches")}</Body> : null}
      {matches.map((item) => {
        const detail = describe?.(item);
        const checked = selected.includes(item.id);
        return (
          <View key={item.id} style={styles.option}>
            <Checkbox
              checked={checked}
              disabled={!checked && full}
              onChange={(next) => toggle(item.id, next)}
              label={detail ? `${item.name} · ${detail}` : item.name}
              testID={`${testIDPrefix}-option-${item.id}`}
            />
          </View>
        );
      })}
      {items.length > VISIBLE_RESULTS && !search ? (
        <Body>{t("merch.refineSearch", { count: items.length })}</Body>
      ) : null}
      <FieldError message={error} testID={`${testIDPrefix}-error`} />
    </View>
  );
}

/** Shared loading / error rendering for the async catalog lists above. */
export function AsyncBlock<T>({
  state,
  reload,
  loadingLabel,
  children,
}: {
  state: AsyncState<T>;
  reload: () => void;
  loadingLabel: string;
  children: (data: T) => React.ReactNode;
}) {
  const { t } = useI18n();
  if (state.status === "loading") return <LoadingBlock label={loadingLabel} />;
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
  return <>{children(state.data)}</>;
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    wrap: { gap: spacing.sm },
    selected: { gap: 6 },
    selectedRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
    position: { color: colors.brand, ...typography.cardTitle, minWidth: 18 },
    name: { flex: 1, color: colors.ink, ...typography.body },
    caption: { color: colors.inkMuted, ...typography.caption },
    option: { paddingVertical: 2 },
  });
  return { colors, styles };
});

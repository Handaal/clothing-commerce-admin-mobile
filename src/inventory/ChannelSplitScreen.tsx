import type {
  InitializeInventoryChannelsResponse,
  AllocateInventoryChannelsResponse,
  InventoryChannelStateResponse,
  MeContextResponse,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  EmptyState,
  ErrorNotice,
  FilterChips,
  Notice,
  NumberField,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SearchField,
  SkeletonRows,
  SummaryStrip,
  Surface,
  TextField,
} from "../ui/components";
import { spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import {
  buildAllocationLines,
  buildSplitRows,
  evaluateSplitRow,
  splitTotals,
  type SplitDraft,
  type SplitRow,
  type SplitRowError,
} from "./channel-split";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "./idempotency";
import { loadAllInventory } from "./load";
import { describeInventoryWriteError } from "./write-errors";

export type ChannelSplitClient = Pick<
  TenantCommerceClient,
  | "listInventory"
  | "getInventoryChannels"
  | "initializeInventoryChannels"
  | "allocateInventoryChannels"
>;

export interface ChannelSplitScreenProps {
  client: ChannelSplitClient;
  context: MeContextResponse;
  onBack?: () => void;
  /** Injected in tests; production uses the platform CSPRNG. */
  generateKey?: IdempotencyKeyFactory;
}

interface LoadedSplit {
  state: InventoryChannelStateResponse;
  rows: SplitRow[];
}

/**
 * Website / POS split (ADR-042). The owner decides how much of each item the storefront and the till may
 * sell at one location. The API is authoritative for every rule and permission; this screen mirrors the
 * checks only so problems are visible before saving.
 */
export function ChannelSplitScreen({
  client,
  context,
  onBack,
  generateKey = secureIdempotencyKey,
}: ChannelSplitScreenProps) {
  const { t } = useI18n();
  const locations = context.access.inventory.locations;
  const [locationId, setLocationId] = useState<string | null>(locations[0]?.id ?? null);

  if (!context.access.inventory.canRead || locationId === null) {
    return (
      <ScrollScreen wide>
        <PageHeader title={t("split.title")} icon="call-split" onBack={onBack} />
        <Notice
          tone="warning"
          title={t("split.noLocationsTitle")}
          message={t("split.noLocationsBody")}
        />
      </ScrollScreen>
    );
  }

  const canAdjust =
    context.access.inventory.write.locations.find((l) => l.id === locationId)?.canAdjust ?? false;

  return (
    <ScrollScreen wide>
      <PageHeader
        title={t("split.title")}
        description={t("split.headerDesc")}
        icon="call-split"
        onBack={onBack}
      />
      {locations.length > 1 ? (
        <FilterChips
          testIDPrefix="split-location"
          selected={locationId}
          onSelect={setLocationId}
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
        />
      ) : null}
      <LocationSplit
        key={locationId}
        client={client}
        locationId={locationId}
        canAdjust={canAdjust}
        generateKey={generateKey}
      />
    </ScrollScreen>
  );
}

function LocationSplit({
  client,
  locationId,
  canAdjust,
  generateKey,
}: {
  client: ChannelSplitClient;
  locationId: string;
  canAdjust: boolean;
  generateKey: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  const load = useCallback(async (): Promise<LoadedSplit> => {
    const [state, inventory] = await Promise.all([
      client.getInventoryChannels({ inventoryLocationId: locationId }),
      loadAllInventory(client, { inventoryLocationId: locationId }),
    ]);
    return { state, rows: buildSplitRows(state.items, inventory, locationId) };
  }, [client, locationId]);
  const { state, reload } = useAsync<LoadedSplit>(load);

  const [drafts, setDrafts] = useState<Record<string, SplitDraft>>({});
  const [reason, setReason] = useState(t("split.reasonDefault"));
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<"setUp" | "saved" | "changed" | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const initialize = useMutation<void, InitializeInventoryChannelsResponse>(
    (_args, idempotencyKey) =>
      client.initializeInventoryChannels({ inventoryLocationId: locationId, idempotencyKey }),
    generateKey,
    {
      onSuccess: () => {
        setNotice("setUp");
        reload();
      },
    },
  );

  const allocate = useMutation<
    { lines: NonNullable<ReturnType<typeof buildAllocationLines>>; reason: string },
    AllocateInventoryChannelsResponse
  >(
    (args, idempotencyKey) =>
      client.allocateInventoryChannels({
        inventoryLocationId: locationId,
        reason: args.reason,
        lines: args.lines,
        idempotencyKey,
      }),
    generateKey,
    {
      onSuccess: (data) => {
        setSavedCount(data.items.length);
        setDrafts({});
        setNotice("saved");
        reload();
      },
      onError: (error) => {
        if (describeInventoryWriteError(error).isConcurrencyConflict) {
          setDrafts({});
          setNotice("changed");
          reload();
        }
      },
    },
  );

  // A save that settled stays visible until the owner edits again; a new edit starts a new operation.
  const { reset: resetAllocate, state: allocateState } = allocate;
  useEffect(() => {
    if (Object.keys(drafts).length > 0 && allocateState.status === "success") resetAllocate();
  }, [drafts, allocateState.status, resetAllocate]);

  const rows = useMemo(() => (state.status === "success" ? state.data.rows : []), [state]);
  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.productName, row.sku].some((v) => v.toLowerCase().includes(term)),
    );
  }, [rows, search]);
  const lines = useMemo(() => buildAllocationLines(rows, drafts), [rows, drafts]);
  const totals = useMemo(() => splitTotals(rows), [rows]);

  const setDraft = (row: SplitRow, field: keyof SplitDraft, value: string) => {
    setNotice(null);
    setDrafts((current) => {
      const existing = current[row.variantId] ?? {
        website: String(row.websiteOnHand),
        pos: String(row.posOnHand),
      };
      return { ...current, [row.variantId]: { ...existing, [field]: value } };
    });
  };

  if (state.status === "loading") return <SkeletonRows testID="split-loading" />;
  if (state.status === "error") {
    return (
      <Notice
        tone="danger"
        title={errorHeading(state.error.kind)}
        message={state.error.message}
        action={
          isRetryable(state.error.kind) ? (
            <PrimaryButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
          ) : undefined
        }
      />
    );
  }

  const mode = state.data.state.mode;

  if (mode === "legacy") {
    const initError =
      initialize.state.status === "error"
        ? describeInventoryWriteError(initialize.state.error)
        : null;
    return (
      <>
        <Notice
          testID="split-legacy"
          tone="info"
          title={t("split.legacyTitle")}
          message={canAdjust ? t("split.legacyBody") : t("split.setUpNoAccess")}
        />
        {initError ? (
          <ErrorNotice
            testID="split-init-error"
            heading={initError.heading}
            message={initError.message}
            onRetry={initError.recovery === "retry" ? initialize.retry : undefined}
            onDismiss={initialize.reset}
          />
        ) : null}
        {canAdjust ? (
          <PrimaryButton
            testID="split-set-up"
            icon="call-split"
            label={t("split.setUp")}
            disabled={initialize.state.status === "submitting"}
            onPress={() => initialize.submit()}
          />
        ) : null}
      </>
    );
  }

  const saveError =
    allocate.state.status === "error" ? describeInventoryWriteError(allocate.state.error) : null;
  const pendingCount = lines?.length ?? 0;
  const canSave =
    canAdjust &&
    lines !== null &&
    pendingCount > 0 &&
    reason.trim().length > 0 &&
    allocate.state.status !== "submitting";

  return (
    <>
      <Notice
        testID={mode === "shadow" ? "split-trial" : "split-active"}
        tone={mode === "shadow" ? "info" : "success"}
        title={mode === "shadow" ? t("split.trialTitle") : t("split.activeTitle")}
        message={mode === "shadow" ? t("split.trialBody") : t("split.activeBody")}
      />
      {!canAdjust ? <Notice tone="warning" message={t("split.readOnly")} /> : null}
      {notice === "setUp" ? (
        <Notice testID="split-set-up-done" tone="success" message={t("split.setUpDone")} />
      ) : null}
      {notice === "saved" ? (
        <Notice
          testID="split-saved"
          tone="success"
          title={t("split.savedTitle")}
          message={t("split.savedBody", { count: savedCount })}
        />
      ) : null}
      {notice === "changed" ? (
        <Notice
          testID="split-changed"
          tone="warning"
          title={t("split.changedTitle")}
          message={t("split.changedBody")}
        />
      ) : null}
      {saveError && !saveError.isConcurrencyConflict ? (
        <ErrorNotice
          testID="split-save-error"
          heading={saveError.heading}
          message={saveError.message}
          onRetry={saveError.recovery === "retry" ? allocate.retry : undefined}
          onDismiss={allocate.reset}
        />
      ) : null}

      <SummaryStrip
        testID="split-summary"
        items={[
          { label: t("split.website"), value: String(totals.website), icon: "web" },
          {
            label: t("split.pos"),
            value: String(totals.pos),
            icon: "cash-register",
            tone: "accent",
          },
          { label: t("split.unallocated"), value: String(totals.unallocated), icon: "tray-full" },
          { label: t("split.notSplit"), value: String(totals.notSplit), icon: "alert-outline" },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="package-variant-closed"
          title={t("split.emptyTitle")}
          message={t("split.emptyBody")}
        />
      ) : (
        <>
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder={t("split.searchPlaceholder")}
            testID="split-search"
          />
          {visibleRows.map((row) => (
            <SplitRowCard
              key={row.variantId}
              row={row}
              draft={drafts[row.variantId]}
              editable={canAdjust}
              onChange={(field, value) => setDraft(row, field, value)}
            />
          ))}
          {canAdjust ? (
            <Surface>
              <TextField
                testID="split-reason"
                label={t("split.reason")}
                value={reason}
                onChangeText={setReason}
                required
              />
              <PrimaryButton
                testID="split-save"
                icon="content-save-outline"
                label={t("split.save", { count: pendingCount })}
                disabled={!canSave}
                onPress={() => {
                  if (lines !== null) allocate.submit({ lines, reason: reason.trim() });
                }}
              />
            </Surface>
          ) : null}
        </>
      )}
    </>
  );
}

function rowErrorMessage(
  t: ReturnType<typeof useI18n>["t"],
  row: SplitRow,
  error: SplitRowError | null,
): string | null {
  switch (error) {
    case "invalidNumber":
      return t("split.errInvalid");
    case "overOnHand":
      return t("split.errOver", { count: row.onHand });
    case "belowWebsiteReserved":
      return t("split.errWebReserved", { count: row.websiteReserved });
    case "belowPosReserved":
      return t("split.errPosReserved", { count: row.posReserved });
    default:
      return null;
  }
}

function SplitRowCard({
  row,
  draft,
  editable,
  onChange,
}: {
  row: SplitRow;
  draft: SplitDraft | undefined;
  editable: boolean;
  onChange: (field: keyof SplitDraft, value: string) => void;
}) {
  const { rowStyles } = useStyles();
  const { t } = useI18n();
  const evaluated = evaluateSplitRow(row, draft);
  const error = rowErrorMessage(t, row, evaluated.error);
  const testID = `split-row-${row.variantId}`;
  return (
    <Surface testID={testID}>
      <View style={rowStyles.header}>
        <View style={rowStyles.titleBlock}>
          <Text style={rowStyles.title}>{row.productName}</Text>
          <Text style={rowStyles.meta}>
            {row.sku ? `${row.sku} · ` : ""}
            {t("split.onHand", { count: row.onHand })}
          </Text>
        </View>
        {row.mismatch !== 0 ? (
          <Badge testID={`${testID}-resplit`} tone="danger" label={t("split.needsResplit")} />
        ) : !row.explicitlyAllocated && row.onHand > 0 ? (
          <Badge testID={`${testID}-not-split`} tone="warning" label={t("split.notSplit")} />
        ) : null}
      </View>
      {row.mismatch !== 0 ? (
        <Text style={rowStyles.hint}>{t("split.needsResplitBody")}</Text>
      ) : null}
      <View style={rowStyles.fields}>
        <View style={rowStyles.field}>
          <NumberField
            testID={`${testID}-website`}
            label={t("split.website")}
            value={draft?.website ?? String(row.websiteOnHand)}
            onChangeText={(value) => onChange("website", value)}
            editable={editable}
          />
        </View>
        <View style={rowStyles.field}>
          <NumberField
            testID={`${testID}-pos`}
            label={t("split.pos")}
            value={draft?.pos ?? String(row.posOnHand)}
            onChangeText={(value) => onChange("pos", value)}
            editable={editable}
          />
        </View>
        <View style={rowStyles.field}>
          <Text style={rowStyles.label}>{t("split.unallocated")}</Text>
          <Text testID={`${testID}-unallocated`} style={rowStyles.value}>
            {evaluated.unallocated === null ? "—" : String(evaluated.unallocated)}
          </Text>
        </View>
      </View>
      {row.websiteReserved > 0 ? (
        <Text style={rowStyles.hint}>{t("split.webReserved", { count: row.websiteReserved })}</Text>
      ) : null}
      {row.posReserved > 0 ? (
        <Text style={rowStyles.hint}>{t("split.posReserved", { count: row.posReserved })}</Text>
      ) : null}
      {error ? (
        <Text testID={`${testID}-error`} style={rowStyles.error}>
          {error}
        </Text>
      ) : null}
    </Surface>
  );
}

const useStyles = createThemedStyles((colors) => {
  const rowStyles = StyleSheet.create({
    header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    titleBlock: { flex: 1, gap: 2 },
    title: { ...typography.cardTitle, color: colors.ink },
    meta: { ...typography.caption, color: colors.inkMuted },
    fields: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
    field: { flexGrow: 1, flexBasis: 96, minWidth: 96 },
    label: { ...typography.label, color: colors.inkMuted, marginBottom: spacing.xs },
    value: { ...typography.cardTitle, color: colors.ink, paddingVertical: spacing.sm },
    hint: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
    error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  });
  return { colors, rowStyles };
});

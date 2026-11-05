import type {
  MeContextResponse,
  OrderDetailResponse,
  ReturnEligibilityResponse,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  Checkbox,
  Divider,
  EmptyState,
  FormSection,
  InfoRow,
  LoadingBlock,
  Notice,
  NumberField,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  SelectField,
  type SelectOption,
  Surface,
  TextButton,
  TextField,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import {
  buildReturnLines,
  canSettleRefund,
  requiresRestockLocation,
  submitCreateReturn,
  validateReturnDraft,
  type ReturnDisposition,
  type ReturnLineSelection,
} from "./create";
import { dispositionLabel, refundMethodLabel, refundStatusLabel } from "./refund";
import { describeReturnWriteError } from "./write-errors";

export interface CreateReturnScreenProps {
  tenantId: string;
  orderId: string;
  /** `/me/context` — the only source of the operator's authorized restock receiving locations. */
  context: MeContextResponse;
  /** Navigate to the newly accepted return's detail. */
  onCreated: (returnId: string) => void;
  onBack: () => void;
  /** Test seam. */
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

type OrderAndEligibility = readonly [OrderDetailResponse, ReturnEligibilityResponse];

/**
 * Management-side create-return flow. Loads the order (for line identity) and the server's return
 * eligibility together, lets the operator select lines with per-line quantity / reason / disposition,
 * requires a receiving location when any line restocks, and creates the return with a `pending` refund.
 * The API re-checks every rule; this screen never invents eligibility client-side.
 */
export function CreateReturnScreen({
  tenantId,
  orderId,
  context,
  onCreated,
  onBack,
  generateIdempotencyKey,
}: CreateReturnScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const load = useCallback(
    (): Promise<OrderAndEligibility> =>
      Promise.all([client.getOrder(orderId), client.getReturnEligibility(orderId)]),
    [client, orderId],
  );
  const { state, reload } = useAsync<OrderAndEligibility>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("createReturn.eyebrow")}
          title={t("createReturn.title")}
          icon="keyboard-return"
          onBack={onBack}
        />
        <LoadingBlock label={t("createReturn.loading")} />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("createReturn.eyebrow")}
          title={errorHeading(state.error.kind)}
          icon="keyboard-return"
          onBack={onBack}
        />
        <Notice
          tone="danger"
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      </ScrollScreen>
    );
  }

  const [order, eligibility] = state.data;
  return (
    <CreateReturnForm
      client={client}
      order={order}
      eligibility={eligibility}
      context={context}
      onReloadEligibility={reload}
      onCreated={onCreated}
      onBack={onBack}
      generateKey={generateIdempotencyKey ?? secureIdempotencyKey}
    />
  );
}

function CreateReturnForm({
  client,
  order,
  eligibility,
  context,
  onReloadEligibility,
  onCreated,
  onBack,
  generateKey,
}: {
  client: Parameters<typeof submitCreateReturn>[0];
  order: OrderDetailResponse;
  eligibility: ReturnEligibilityResponse;
  context: MeContextResponse;
  onReloadEligibility: () => void;
  onCreated: (returnId: string) => void;
  onBack: () => void;
  generateKey: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  const [selection, setSelection] = useState<ReturnLineSelection>({});
  const [restockLocationId, setRestockLocationId] = useState<string | null>(null);
  const [review, setReview] = useState(false);

  const mutation = useMutation(
    (args: Parameters<typeof submitCreateReturn>[1], key) => submitCreateReturn(client, args, key),
    generateKey,
  );

  // Line identity (product name + SKU) comes from the immutable order snapshot, keyed by line number.
  const lineInfoByNumber = useMemo(
    () => new Map(order.lines.map((line) => [line.lineNumber, line])),
    [order.lines],
  );

  // Receiving locations the operator may restock into, exactly as `/me/context` reports them.
  const restockLocationOptions = useMemo<SelectOption[]>(
    () =>
      context.access.inventory.write.locations
        .filter((location) => location.canReceive)
        .map((location) => ({ value: location.id, label: location.name })),
    [context.access.inventory.write.locations],
  );

  const lines = useMemo(() => buildReturnLines(eligibility, selection), [eligibility, selection]);
  const restock = requiresRestockLocation(lines);
  const problem = validateReturnDraft({ eligibility, lines, restockLocationId });
  const valid = problem === null;

  function updateLine(orderLineId: string, change: Partial<ReturnLineSelection[string]>) {
    setReview(false);
    setSelection((current) => ({
      ...current,
      [orderLineId]: { ...current[orderLineId], ...change },
    }));
  }

  function toggleLine(orderLineId: string, checked: boolean) {
    setReview(false);
    setSelection((current) => {
      if (checked) {
        return {
          ...current,
          [orderLineId]: { quantity: "1", reason: "", disposition: "non_restock" },
        };
      }
      const next = { ...current };
      delete next[orderLineId];
      return next;
    });
  }

  function onSubmit() {
    if (!valid) return;
    mutation.submit({
      orderId: order.header.id,
      lines,
      inventoryLocationId: restock ? restockLocationId : null,
    });
  }

  function lineLabel(lineNumber: number): string {
    const info = lineInfoByNumber.get(lineNumber);
    return info ? `${info.productName} · ${info.sku}` : t("createReturn.orderLine", { n: lineNumber });
  }

  if (mutation.state.status === "success") {
    const created = mutation.state.data;
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("createReturn.eyebrow")}
          title={t("createReturn.acceptedTitle")}
          icon="check-circle-outline"
        />
        <Surface tone="brand" testID="create-return-success">
          <Title>{t("createReturn.acceptedFor", { number: order.header.orderNumber })}</Title>
          <InfoRow
            label={t("createReturn.returnedValue")}
            value={formatMoneyMinor(created.amountMinor, created.currency)}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Badge label={refundStatusLabel(created.refund.status)} testID="create-return-refund-status" />
            <Badge label={refundMethodLabel(created.refund.method)} />
          </View>
          {canSettleRefund(created.refund) ? (
            <Notice tone="info" message={t("createReturn.settlePendingNote")} />
          ) : null}
          <PrimaryButton
            testID="open-created-return"
            label={t("createReturn.viewReturnCta")}
            icon="arrow-right"
            onPress={() => onCreated(created.id)}
          />
          <TextButton label={t("createReturn.backToOrder")} icon="arrow-left" onPress={onBack} />
        </Surface>
      </ScrollScreen>
    );
  }

  const described =
    mutation.state.status === "error" ? describeReturnWriteError(mutation.state.error) : null;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("createReturn.eyebrow")}
        title={t("createReturn.title")}
        description={t("createReturn.formDesc", { number: order.header.orderNumber })}
        icon="keyboard-return"
        onBack={onBack}
      />

      <Surface tone="accent">
        <InfoRow
          label={t("createReturn.serverEligibility")}
          value={eligibility.eligible ? t("createReturn.eligible") : t("createReturn.notEligible")}
        />
        {eligibility.reason ? (
          <InfoRow label={t("createReturn.reasonLabel")} value={eligibility.reason} />
        ) : null}
        <InfoRow
          label={t("createReturn.maxRefundable")}
          value={formatMoneyMinor(eligibility.maxRefundableMinor, eligibility.currency)}
        />
        <TextButton label={t("createReturn.refreshEligibility")} icon="refresh" onPress={onReloadEligibility} />
      </Surface>

      {!eligibility.eligible ? (
        <Notice tone="warning" title={t("createReturn.notEligibleTitle")} message={t("createReturn.notEligibleMsg")} />
      ) : eligibility.lines.length === 0 ? (
        <EmptyState
          icon="format-list-bulleted"
          title={t("createReturn.noLinesTitle")}
          message={t("createReturn.noLinesMsg")}
        />
      ) : (
        <>
          <SectionHeading title={t("createReturn.selectItems")} detail={t("createReturn.selectItemsDetail")} />
          <View style={{ gap: 12 }}>
            {eligibility.lines.map((line) => {
              const selected = selection[line.orderLineId];
              const reasonError =
                selected && review && selected.reason.trim().length === 0
                  ? t("createReturn.errReasonRequired")
                  : undefined;
              return (
                <Surface key={line.orderLineId} testID={`create-return-line-${line.lineNumber}`}>
                  <Checkbox
                    testID={`create-return-select-${line.lineNumber}`}
                    checked={!!selected}
                    disabled={line.eligibleQuantity === 0}
                    label={lineLabel(line.lineNumber)}
                    onChange={(checked) => toggleLine(line.orderLineId, checked)}
                  />
                  <InfoRow
                    label={t("createReturn.eligibleQty")}
                    value={t("createReturn.eligibleQtyValue", {
                      eligible: line.eligibleQuantity,
                      purchased: line.purchasedQuantity,
                      returned: line.returnedQuantity,
                    })}
                  />
                  <InfoRow
                    label={t("createReturn.unitPrice")}
                    value={formatMoneyMinor(line.unitPriceMinor, eligibility.currency)}
                  />
                  {selected ? (
                    <View style={{ gap: 8 }}>
                      <NumberField
                        label={t("createReturn.quantity")}
                        value={selected.quantity}
                        onChangeText={(value) => updateLine(line.orderLineId, { quantity: value })}
                        testID={`create-return-qty-${line.lineNumber}`}
                        required
                      />
                      {eligibility.policy.allowedReasons !== null ? (
                        <SelectField
                          label={t("createReturn.reason")}
                          options={eligibility.policy.allowedReasons.map((reason) => ({
                            value: reason,
                            label: reason,
                          }))}
                          selected={selected.reason || null}
                          onSelect={(value) => updateLine(line.orderLineId, { reason: value })}
                          testIDPrefix={`create-return-reason-${line.lineNumber}`}
                          required
                          error={reasonError}
                        />
                      ) : (
                        <TextField
                          label={t("createReturn.reason")}
                          value={selected.reason}
                          onChangeText={(value) => updateLine(line.orderLineId, { reason: value })}
                          testID={`create-return-reason-${line.lineNumber}`}
                          required
                          error={reasonError}
                        />
                      )}
                      <SelectField
                        label={t("createReturn.disposition")}
                        options={[
                          { value: "non_restock", label: dispositionLabel("non_restock") },
                          { value: "restock", label: dispositionLabel("restock") },
                        ]}
                        selected={selected.disposition}
                        onSelect={(value) =>
                          updateLine(line.orderLineId, { disposition: value as ReturnDisposition })
                        }
                        testIDPrefix={`create-return-disposition-${line.lineNumber}`}
                      />
                    </View>
                  ) : null}
                </Surface>
              );
            })}
          </View>

          {restock ? (
            <FormSection
              title={t("createReturn.restockSection")}
              description={t("createReturn.restockDesc")}
              icon="warehouse"
            >
              {restockLocationOptions.length === 0 ? (
                <Notice
                  tone="warning"
                  testID="create-return-no-receive"
                  title={t("createReturn.noReceiveTitle")}
                  message={t("createReturn.noReceiveMsg")}
                />
              ) : (
                <SelectField
                  label={t("createReturn.receivingLocation")}
                  options={restockLocationOptions}
                  selected={restockLocationId}
                  onSelect={setRestockLocationId}
                  testIDPrefix="create-return-location"
                  required
                />
              )}
            </FormSection>
          ) : null}

          {described ? (
            <Notice
              tone="danger"
              title={described.heading}
              message={described.message}
              testID="create-return-error"
              action={
                described.recovery === "retry" ? (
                  <TextButton label={t("common.retry")} icon="refresh" testID="create-return-retry" onPress={() => mutation.retry()} />
                ) : described.recovery === "reload" ? (
                  <TextButton label={t("createReturn.reloadEligibility")} icon="refresh" onPress={onReloadEligibility} />
                ) : (
                  <TextButton label={t("common.dismiss")} icon="close" onPress={() => mutation.reset()} />
                )
              }
            />
          ) : null}

          {!review ? (
            <PrimaryButton
              label={t("createReturn.reviewCta")}
              testID="create-return-review"
              disabled={!valid}
              onPress={() => setReview(true)}
            />
          ) : (
            <Surface tone="brand" testID="create-return-review-panel">
              <SectionHeading title={t("createReturn.confirmTitle")} detail={t("createReturn.confirmDetail")} />
              <View style={{ gap: 8 }}>
                {lines.map((line) => {
                  const info = eligibility.lines.find((item) => item.orderLineId === line.orderLineId);
                  return (
                    <View key={line.orderLineId}>
                      <Body>
                        {t("createReturn.confirmLine", {
                          item: lineLabel(info?.lineNumber ?? 0),
                          quantity: line.quantity,
                          disposition: dispositionLabel(line.disposition),
                          reason: line.reason,
                        })}
                      </Body>
                    </View>
                  );
                })}
              </View>
              <Divider />
              <TextButton label={t("createReturn.editCta")} icon="pencil" onPress={() => setReview(false)} />
              <PrimaryButton
                label={mutation.state.status === "submitting" ? t("createReturn.creating") : t("createReturn.confirmCta")}
                icon="check"
                testID="create-return-submit"
                disabled={!valid || mutation.state.status === "submitting"}
                onPress={onSubmit}
              />
            </Surface>
          )}
        </>
      )}
    </ScrollScreen>
  );
}

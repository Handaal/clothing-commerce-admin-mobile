import { useCallback, useState } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
import { type IdempotencyKeyFactory } from "../inventory/idempotency";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  ConfirmButton,
  FormSection,
  InfoRow,
  LoadingBlock,
  Notice,
  NumberField,
  PrimaryButton,
  SectionHeading,
  SelectField,
  type SelectOption,
  Surface,
  SurfaceRow,
  TextButton,
  TextField,
  Title,
} from "../ui/components";
import type { ClassifiedCommerceError } from "../commerce/errors";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import type { SupplierAdapter } from "./adapter";
import {
  buildPurchaseLines,
  emptyPurchaseLine,
  parsePaymentAmount,
  reminderAmountMinor,
  validatePurchaseDraft,
  validateReminderDraft,
  type PurchaseLineDraft,
  type ReminderDraft,
  type SupplierDue,
  type SupplierPayment,
  type SupplierPurchase,
  type SupplierPurchaseItem,
  type SupplierReminder,
} from "./ledger";
import { loadAllSupplierPayments, loadAllSupplierPurchases } from "./load";
import { describeSupplierWriteError } from "./write-errors";

export interface SupplierLedgerProps {
  adapter: SupplierAdapter;
  supplierId: string;
  canManage: boolean;
  /** Receiving locations the caller may purchase into, from `/me/context` (empty disables recording). */
  locationOptions: SelectOption[];
  /** Lazily loads the purchasable variants (distinct items from inventory). */
  loadVariants: () => Promise<SelectOption[]>;
  generateKey: IdempotencyKeyFactory;
}

/**
 * The supplier accounts-payable ledger: outstanding balance, recorded purchases (with line items),
 * payments, and settlement reminders. It reads through the adapter and never reconstructs balances
 * client-side — every total comes from the server. Write forms appear only when the caller may manage
 * suppliers; the API still authorizes each mutation.
 */
export function SupplierLedger(props: SupplierLedgerProps) {
  return (
    <View style={{ gap: 12 }}>
      <SupplierBalance adapter={props.adapter} supplierId={props.supplierId} />
      <SupplierPurchases {...props} />
      <SupplierPayments {...props} />
      <SupplierReminders {...props} />
    </View>
  );
}

// ── Outstanding balance ──────────────────────────────────────────────────────────────────────────

function SupplierBalance({ adapter, supplierId }: { adapter: SupplierAdapter; supplierId: string }) {
  const { t } = useI18n();
  const load = useCallback(() => adapter.supplierDues(), [adapter]);
  const { state, reload } = useAsync<SupplierDue[]>(load);

  return (
    <FormSection title={t("supLedger.balanceSection")} icon="scale-balance">
      {state.status === "loading" ? <LoadingBlock label={t("supLedger.balanceLoading")} /> : null}
      {state.status === "error" ? (
        <LedgerError error={state.error} onRetry={reload} />
      ) : state.status === "success" ? (
        (() => {
          const due = state.data.find((item) => item.supplierId === supplierId);
          if (!due) return <Notice testID="supplier-balance-empty" message={t("supLedger.noBalance")} />;
          return (
            <View testID="supplier-balance">
              <InfoRow label={t("supLedger.purchased")} value={formatMoneyMinor(due.purchasedMinor, due.currency)} />
              <InfoRow label={t("supLedger.paid")} value={formatMoneyMinor(due.paidMinor, due.currency)} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Body>{t("supLedger.outstanding")}</Body>
                <Badge
                  label={formatMoneyMinor(due.outstandingMinor, due.currency)}
                  tone={due.outstandingMinor > 0 ? "warning" : "success"}
                  testID="supplier-outstanding"
                />
              </View>
            </View>
          );
        })()
      ) : null}
    </FormSection>
  );
}

// ── Purchases ──────────────────────────────────────────────────────────────────────────────────

function SupplierPurchases(props: SupplierLedgerProps) {
  const { adapter, supplierId } = props;
  const { t } = useI18n();
  const load = useCallback(() => loadAllSupplierPurchases(adapter, supplierId), [adapter, supplierId]);
  const { state, reload } = useAsync<SupplierPurchase[]>(load);

  return (
    <FormSection
      title={t("supLedger.purchasesSection")}
      description={t("supLedger.purchasesDesc")}
      icon="cart-outline"
    >
      {props.canManage ? <RecordPurchaseForm {...props} onRecorded={reload} /> : null}
      {state.status === "loading" ? <LoadingBlock label={t("supLedger.purchasesLoading")} /> : null}
      {state.status === "error" ? <LedgerError error={state.error} onRetry={reload} /> : null}
      {state.status === "success" ? (
        state.data.length === 0 ? (
          <Notice testID="supplier-purchases-empty" message={t("supLedger.purchasesEmpty")} />
        ) : (
          <View style={{ gap: 12 }}>
            {state.data.map((purchase) => (
              <PurchaseRow key={purchase.id} adapter={adapter} purchase={purchase} />
            ))}
          </View>
        )
      ) : null}
    </FormSection>
  );
}

function PurchaseRow({ adapter, purchase }: { adapter: SupplierAdapter; purchase: SupplierPurchase }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  return (
    <SurfaceRow testID={`supplier-purchase-${purchase.id}`}>
      <SectionHeading
        title={formatDate(purchase.occurredAt)}
        detail={formatMoneyMinor(purchase.totalMinor, purchase.currency)}
      />
      {purchase.supplierReference ? (
        <InfoRow label={t("supLedger.purchaseReference")} value={purchase.supplierReference} />
      ) : null}
      <InfoRow label={t("supLedger.purchaseLocation")} value={purchase.inventoryLocationName} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Body>{t("supLedger.purchaseOutstanding")}</Body>
        <Badge
          label={formatMoneyMinor(purchase.outstandingMinor, purchase.currency)}
          tone={purchase.outstandingMinor > 0 ? "warning" : "success"}
        />
      </View>
      <TextButton
        label={expanded ? t("supLedger.hideItems") : t("supLedger.viewItems")}
        icon={expanded ? "chevron-up" : "chevron-down"}
        testID={`supplier-purchase-items-toggle-${purchase.id}`}
        onPress={() => setExpanded((v) => !v)}
      />
      {expanded ? <PurchaseItems adapter={adapter} purchaseId={purchase.id} currency={purchase.currency} /> : null}
    </SurfaceRow>
  );
}

function PurchaseItems({
  adapter,
  purchaseId,
  currency,
}: {
  adapter: SupplierAdapter;
  purchaseId: string;
  currency: string;
}) {
  const { t } = useI18n();
  const load = useCallback(() => adapter.supplierPurchaseItems(purchaseId), [adapter, purchaseId]);
  const { state, reload } = useAsync<SupplierPurchaseItem[]>(load);
  if (state.status === "loading") return <LoadingBlock label={t("supLedger.itemsLoading")} />;
  if (state.status === "error") return <LedgerError error={state.error} onRetry={reload} />;
  return (
    <View style={{ gap: 4 }}>
      {state.data.map((item) => (
        <InfoRow
          key={item.id}
          label={`${item.productName} · ${item.sku} · ×${item.quantity}`}
          value={formatMoneyMinor(item.lineTotalMinor, currency)}
        />
      ))}
    </View>
  );
}

function RecordPurchaseForm({
  adapter,
  supplierId,
  locationOptions,
  loadVariants,
  generateKey,
  onRecorded,
}: SupplierLedgerProps & { onRecorded: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const variants = useAsync<SelectOption[]>(loadVariants);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [lines, setLines] = useState<PurchaseLineDraft[]>([emptyPurchaseLine()]);
  const [reference, setReference] = useState("");
  const [paid, setPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function clearFields() {
    setLocationId(null);
    setLines([emptyPurchaseLine()]);
    setReference("");
    setPaid("");
    setNotes("");
    setLocalError(null);
  }

  const mutation = useMutation(
    (args: Parameters<SupplierAdapter["recordSupplierPurchase"]>[0], key) =>
      adapter.recordSupplierPurchase(args, key),
    generateKey,
    {
      // Collapse + clear the form once the purchase records, then refresh the list and balance.
      onSuccess: () => {
        setOpen(false);
        clearFields();
        onRecorded();
      },
    },
  );

  function onSubmit() {
    const built = buildPurchaseLines(lines);
    const problem = validatePurchaseDraft({ inventoryLocationId: locationId, lines: built });
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    const paidParsed = paid.trim() ? parsePaymentAmount(paid) : null;
    if (paidParsed && !paidParsed.ok) {
      setLocalError(paidParsed.error);
      return;
    }
    mutation.submit({
      supplierId,
      inventoryLocationId: locationId as string,
      lines: built,
      ...(reference.trim() ? { supplierReference: reference.trim() } : {}),
      ...(paidParsed && paidParsed.ok ? { paidMinor: paidParsed.amountMinor } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  }

  if (!open) {
    return (
      <PrimaryButton
        label={t("supLedger.recordPurchase")}
        icon="plus"
        variant="secondary"
        testID="supplier-record-purchase-open"
        onPress={() => setOpen(true)}
      />
    );
  }

  const variantOptions = variants.state.status === "success" ? variants.state.data : [];
  const described =
    mutation.state.status === "error" ? describeSupplierWriteError(mutation.state.error) : null;

  return (
    <Surface tone="accent" testID="supplier-record-purchase-form">
      <SectionHeading title={t("supLedger.recordPurchase")} />
      {locationOptions.length === 0 ? (
        <Notice tone="warning" message={t("supLedger.errLocation")} />
      ) : (
        <SelectField
          label={t("supLedger.purchaseLocationField")}
          options={locationOptions}
          selected={locationId}
          onSelect={setLocationId}
          testIDPrefix="supplier-purchase-location"
          required
        />
      )}
      {variants.state.status === "loading" ? <LoadingBlock label={t("supLedger.itemsLoading")} /> : null}
      {variantOptions.length === 0 && variants.state.status === "success" ? (
        <Notice tone="warning" message={t("supLedger.noVariants")} />
      ) : null}
      {lines.map((line, index) => (
        <View key={index} style={{ gap: 8 }} testID={`supplier-purchase-line-${index}`}>
          <Title>{t("supLedger.lineLabel", { n: index + 1 })}</Title>
          <SelectField
            label={t("supLedger.item")}
            options={variantOptions}
            selected={line.variantId}
            onSelect={(value) =>
              setLines((cur) => cur.map((l, i) => (i === index ? { ...l, variantId: value } : l)))
            }
            testIDPrefix={`supplier-purchase-variant-${index}`}
            emptyLabel={t("supLedger.noVariants")}
          />
          <NumberField
            label={t("supLedger.qty")}
            value={line.quantity}
            onChangeText={(value) =>
              setLines((cur) => cur.map((l, i) => (i === index ? { ...l, quantity: value } : l)))
            }
            testID={`supplier-purchase-qty-${index}`}
          />
          <TextField
            label={t("supLedger.unitCost")}
            value={line.unitCost}
            onChangeText={(value) =>
              setLines((cur) => cur.map((l, i) => (i === index ? { ...l, unitCost: value } : l)))
            }
            testID={`supplier-purchase-unitcost-${index}`}
          />
          {lines.length > 1 ? (
            <TextButton
              label={t("supLedger.removeLine")}
              icon="close"
              onPress={() => setLines((cur) => cur.filter((_, i) => i !== index))}
            />
          ) : null}
        </View>
      ))}
      <TextButton
        label={t("supLedger.addLine")}
        icon="plus"
        testID="supplier-purchase-add-line"
        onPress={() => setLines((cur) => [...cur, emptyPurchaseLine()])}
      />
      <TextField
        label={t("supLedger.referenceOptional")}
        value={reference}
        onChangeText={setReference}
        testID="supplier-purchase-reference"
      />
      <TextField
        label={t("supLedger.initialPaid")}
        value={paid}
        onChangeText={setPaid}
        testID="supplier-purchase-paid"
      />
      <TextField
        label={t("supLedger.notesOptional")}
        value={notes}
        onChangeText={setNotes}
        testID="supplier-purchase-notes"
        multiline
      />
      {localError ? <Body>{localError}</Body> : null}
      {described ? (
        <LedgerWriteError described={described} onRetry={() => mutation.retry()} onDismiss={() => mutation.reset()} testID="supplier-purchase-error" />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? t("supLedger.recording") : t("supLedger.recordPurchaseCta")}
        icon="check"
        testID="supplier-purchase-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
      <TextButton label={t("common.cancel")} onPress={() => setOpen(false)} />
    </Surface>
  );
}

// ── Payments ───────────────────────────────────────────────────────────────────────────────────

function SupplierPayments(props: SupplierLedgerProps) {
  const { adapter, supplierId } = props;
  const { t } = useI18n();
  const load = useCallback(() => loadAllSupplierPayments(adapter, supplierId), [adapter, supplierId]);
  const { state, reload } = useAsync<SupplierPayment[]>(load);

  return (
    <FormSection
      title={t("supLedger.paymentsSection")}
      description={t("supLedger.paymentsDesc")}
      icon="cash-multiple"
    >
      {props.canManage ? <RecordPaymentForm {...props} onRecorded={reload} /> : null}
      {state.status === "loading" ? <LoadingBlock label={t("supLedger.paymentsLoading")} /> : null}
      {state.status === "error" ? <LedgerError error={state.error} onRetry={reload} /> : null}
      {state.status === "success" ? (
        state.data.length === 0 ? (
          <Notice testID="supplier-payments-empty" message={t("supLedger.paymentsEmpty")} />
        ) : (
          <View style={{ gap: 8 }}>
            {state.data.map((payment) => (
              <SurfaceRow key={payment.id} testID={`supplier-payment-${payment.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Title>{formatMoneyMinor(payment.amountMinor, payment.currency)}</Title>
                </View>
                <InfoRow label={t("supLedger.paymentDate")} value={formatDate(payment.paidAt)} />
                {payment.notes ? <InfoRow label={t("supLedger.notesOptional")} value={payment.notes} /> : null}
              </SurfaceRow>
            ))}
          </View>
        )
      ) : null}
    </FormSection>
  );
}

function RecordPaymentForm({
  adapter,
  supplierId,
  generateKey,
  onRecorded,
}: SupplierLedgerProps & { onRecorded: () => void }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation(
    (args: { amountMinor: number; notes?: string }, key) =>
      adapter.recordSupplierPayment(supplierId, args, key),
    generateKey,
    {
      onSuccess: () => {
        setAmount("");
        setNotes("");
        onRecorded();
      },
    },
  );

  function onSubmit() {
    const parsed = parsePaymentAmount(amount);
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    setLocalError(null);
    mutation.submit({ amountMinor: parsed.amountMinor, ...(notes.trim() ? { notes: notes.trim() } : {}) });
  }

  const described =
    mutation.state.status === "error" ? describeSupplierWriteError(mutation.state.error) : null;

  return (
    <Surface testID="supplier-record-payment-form">
      <NumberField
        label={t("supLedger.paymentAmount")}
        value={amount}
        onChangeText={(value) => {
          setAmount(value);
          if (localError) setLocalError(null);
        }}
        testID="supplier-payment-amount"
        required
      />
      <TextField
        label={t("supLedger.notesOptional")}
        value={notes}
        onChangeText={setNotes}
        testID="supplier-payment-notes"
      />
      {localError ? <Body>{localError}</Body> : null}
      {described ? (
        <LedgerWriteError described={described} onRetry={() => mutation.retry()} onDismiss={() => mutation.reset()} testID="supplier-payment-error" />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? t("supLedger.recording") : t("supLedger.recordPaymentCta")}
        icon="cash-plus"
        testID="supplier-payment-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </Surface>
  );
}

// ── Reminders ──────────────────────────────────────────────────────────────────────────────────

function SupplierReminders(props: SupplierLedgerProps) {
  const { adapter, supplierId } = props;
  const { t } = useI18n();
  const load = useCallback(
    () => adapter.listSupplierReminders({ supplierId }),
    [adapter, supplierId],
  );
  const { state, reload } = useAsync<SupplierReminder[]>(load);

  return (
    <FormSection
      title={t("supLedger.remindersSection")}
      description={t("supLedger.remindersDesc")}
      icon="bell-outline"
    >
      {props.canManage ? <AddReminderForm {...props} onAdded={reload} /> : null}
      {state.status === "loading" ? <LoadingBlock label={t("supLedger.remindersLoading")} /> : null}
      {state.status === "error" ? <LedgerError error={state.error} onRetry={reload} /> : null}
      {state.status === "success" ? (
        state.data.length === 0 ? (
          <Notice testID="supplier-reminders-empty" message={t("supLedger.remindersEmpty")} />
        ) : (
          <View style={{ gap: 8 }}>
            {state.data.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                canManage={props.canManage}
                adapter={adapter}
                generateKey={props.generateKey}
                onChanged={reload}
              />
            ))}
          </View>
        )
      ) : null}
    </FormSection>
  );
}

function ReminderRow({
  reminder,
  canManage,
  adapter,
  generateKey,
  onChanged,
}: {
  reminder: SupplierReminder;
  canManage: boolean;
  adapter: SupplierAdapter;
  generateKey: IdempotencyKeyFactory;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const markDone = useMutation(
    (_: void, key) => adapter.updateSupplierReminder(reminder.id, { status: "done" }, key),
    generateKey,
    { onSuccess: onChanged },
  );
  const remove = useMutation((_: void, key) => adapter.deleteSupplierReminder(reminder.id, key), generateKey, {
    onSuccess: onChanged,
  });
  const busy = markDone.state.status === "submitting" || remove.state.status === "submitting";

  return (
    <SurfaceRow testID={`supplier-reminder-${reminder.id}`}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Badge
          label={reminder.status === "done" ? t("supLedger.statusDone") : t("supLedger.statusPending")}
          tone={reminder.status === "done" ? "success" : "neutral"}
          testID={`supplier-reminder-status-${reminder.id}`}
        />
        {reminder.isOverdue ? <Badge label={t("supLedger.overdue")} tone="danger" /> : reminder.isDue ? <Badge label={t("supLedger.dueSoon")} tone="warning" /> : null}
      </View>
      <InfoRow label={t("supLedger.reminderDue")} value={reminder.dueDate} />
      {reminder.amountMinor !== null ? (
        <InfoRow label={t("supLedger.reminderAmount")} value={formatMoneyMinor(reminder.amountMinor, reminder.currency)} />
      ) : null}
      {reminder.note ? <InfoRow label={t("supLedger.reminderNote")} value={reminder.note} /> : null}
      {canManage ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {reminder.status !== "done" ? (
            <PrimaryButton
              label={t("supLedger.markDone")}
              icon="check"
              variant="secondary"
              disabled={busy}
              testID={`supplier-reminder-done-${reminder.id}`}
              onPress={() => markDone.submit()}
            />
          ) : null}
          <ConfirmButton
            label={t("supLedger.deleteReminder")}
            confirmLabel={t("supLedger.deleteReminder")}
            disabled={busy}
            testID={`supplier-reminder-delete-${reminder.id}`}
            onConfirm={() => remove.submit()}
          />
        </View>
      ) : null}
    </SurfaceRow>
  );
}

function AddReminderForm({
  adapter,
  supplierId,
  generateKey,
  onAdded,
}: SupplierLedgerProps & { onAdded: () => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<ReminderDraft>({ dueDate: "", amount: "", note: "" });
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation(
    (args: { supplierId: string; dueDate: string; amountMinor?: number; note?: string }, key) =>
      adapter.createSupplierReminder(args, key),
    generateKey,
    {
      onSuccess: () => {
        setDraft({ dueDate: "", amount: "", note: "" });
        onAdded();
      },
    },
  );

  function onSubmit() {
    const problem = validateReminderDraft(draft);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    const amountMinor = reminderAmountMinor(draft);
    mutation.submit({
      supplierId,
      dueDate: draft.dueDate.trim(),
      ...(amountMinor !== undefined ? { amountMinor } : {}),
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    });
  }

  const described =
    mutation.state.status === "error" ? describeSupplierWriteError(mutation.state.error) : null;

  return (
    <Surface testID="supplier-add-reminder-form">
      <TextField
        label={t("supLedger.reminderDue")}
        value={draft.dueDate}
        onChangeText={(value) => {
          setDraft((d) => ({ ...d, dueDate: value }));
          if (localError) setLocalError(null);
        }}
        placeholder="2026-10-01"
        testID="supplier-reminder-due"
        hint={t("supLedger.reminderDueHint")}
      />
      <NumberField
        label={t("supLedger.reminderAmount")}
        value={draft.amount}
        onChangeText={(value) => setDraft((d) => ({ ...d, amount: value }))}
        testID="supplier-reminder-amount"
      />
      <TextField
        label={t("supLedger.reminderNote")}
        value={draft.note}
        onChangeText={(value) => setDraft((d) => ({ ...d, note: value }))}
        testID="supplier-reminder-note"
      />
      {localError ? <Body>{localError}</Body> : null}
      {described ? (
        <LedgerWriteError described={described} onRetry={() => mutation.retry()} onDismiss={() => mutation.reset()} testID="supplier-reminder-error" />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? t("supLedger.recording") : t("supLedger.addReminderCta")}
        icon="bell-plus-outline"
        testID="supplier-reminder-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </Surface>
  );
}

// ── Shared ─────────────────────────────────────────────────────────────────────────────────────

function LedgerError({
  error,
  onRetry,
}: {
  error: ClassifiedCommerceError;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <Notice
      tone="danger"
      title={errorHeading(error.kind)}
      message={error.message}
      action={
        isRetryable(error.kind) ? (
          <TextButton label={t("common.tryAgain")} icon="refresh" onPress={onRetry} />
        ) : undefined
      }
    />
  );
}

function LedgerWriteError({
  described,
  onRetry,
  onDismiss,
  testID,
}: {
  described: ReturnType<typeof describeSupplierWriteError>;
  onRetry: () => void;
  onDismiss: () => void;
  testID: string;
}) {
  const { t } = useI18n();
  return (
    <Notice
      tone="danger"
      title={described.heading}
      message={described.message}
      testID={testID}
      action={
        described.recovery === "retry" ? (
          <TextButton label={t("common.retry")} icon="refresh" onPress={onRetry} />
        ) : (
          <TextButton label={t("common.dismiss")} icon="close" onPress={onDismiss} />
        )
      }
    />
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

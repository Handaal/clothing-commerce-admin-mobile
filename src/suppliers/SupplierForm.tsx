import { useState } from "react";

import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  EmptyState,
  FormSection,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  type SelectOption,
  TextButton,
  TextField,
} from "../ui/components";
import { useToast } from "../ui/Toast";
import { useMutation, type Mutation } from "../ui/useMutation";
import type { SupplierAdapter } from "./adapter";
import {
  hasSupplierErrors,
  normalizeSupplierDraft,
  validateSupplierDraft,
  type Supplier,
  type SupplierDraft,
  type SupplierFieldErrors,
  type SupplierStatus,
} from "./model";
import { supplierStatusLabel } from "./status";
import { describeSupplierWriteError } from "./write-errors";

export type SupplierFormMode = "create" | "edit";

export interface SupplierFormProps {
  mode: SupplierFormMode;
  /** Non-null: the form is only reachable once an adapter exists (the seam gates before this). */
  adapter: SupplierAdapter;
  /** Present in edit mode: the supplier being edited, used to seed the fields. */
  initial?: Supplier;
  onSaved: (supplier: Supplier) => void;
  onBack: () => void;
  /** Test seam: deterministic idempotency keys. Production uses the secure default. */
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

const SUPPLIER_STATUS_VALUES: SupplierStatus[] = ["active", "inactive"];

/**
 * The one reusable Supplier form, shared by create and edit. It captures the local {@link SupplierDraft}
 * fields, validates locally (UX only — the API is authoritative), and submits through the adapter seam
 * with an idempotency key via {@link useMutation}, so a retried create/update is applied at most once.
 * There is NO fake success path: `onSaved` fires only with the adapter's real response.
 */
export function SupplierForm({
  mode,
  adapter,
  initial,
  onSaved,
  onBack,
  generateIdempotencyKey,
}: SupplierFormProps) {
  const generateKey = generateIdempotencyKey ?? secureIdempotencyKey;
  const { t } = useI18n();
  const statusOptions: SelectOption[] = SUPPLIER_STATUS_VALUES.map((value) => ({
    value,
    label: supplierStatusLabel(value),
  }));

  const [name, setName] = useState(initial?.name ?? "");
  const [referenceCode, setReferenceCode] = useState(initial?.referenceCode ?? "");
  const [contactPerson, setContactPerson] = useState(initial?.contactPerson ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<SupplierStatus>(initial?.status ?? "active");
  const [errors, setErrors] = useState<SupplierFieldErrors>({});
  const toast = useToast();

  const mutation = useMutation<SupplierDraft, Supplier>(
    (draft, key) =>
      mode === "create"
        ? adapter.createSupplier(draft, key)
        : adapter.updateSupplier((initial as Supplier).id, draft, key),
    generateKey,
    {
      onSuccess: (saved) =>
        toast.success(
          t("supplierForm.savedMessage", {
            name: saved.name,
            action:
              mode === "create" ? t("supplierForm.createdAction") : t("supplierForm.updatedAction"),
            status: supplierStatusLabel(saved.status).toLowerCase(),
          }),
          {
            title:
              mode === "create" ? t("supplierForm.createdTitle") : t("supplierForm.updatedTitle"),
          },
        ),
      onError: (error) => {
        const described = describeSupplierWriteError(error);
        toast.error(described.message, {
          title: described.heading,
          ...(described.recovery === "retry"
            ? {
                action: {
                  label: t("common.retry"),
                  icon: "refresh" as const,
                  onPress: () => mutation.retry(),
                },
              }
            : {}),
        });
      },
    },
  );

  function currentDraft(): SupplierDraft {
    return normalizeSupplierDraft({
      name,
      referenceCode,
      contactPerson,
      phone,
      email,
      address,
      notes,
      status,
    });
  }

  function onSubmit() {
    const draft = currentDraft();
    const found = validateSupplierDraft(draft);
    setErrors(found);
    if (hasSupplierErrors(found)) {
      toast.error(t("common.fixHighlightedSave"));
      return;
    }
    mutation.submit(draft);
  }

  const clearError = (field: keyof SupplierFieldErrors) =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  if (mutation.state.status === "success") {
    const saved = mutation.state.data;
    return (
      <ScrollScreen>
        <PageTitle mode={mode} onBack={onBack} />
        <EmptyState
          icon="check-circle-outline"
          title={
            mode === "create" ? t("supplierForm.createdTitle") : t("supplierForm.updatedTitle")
          }
          message={t("supplierForm.savedMessage", {
            name: saved.name,
            action:
              mode === "create" ? t("supplierForm.createdAction") : t("supplierForm.updatedAction"),
            status: supplierStatusLabel(saved.status).toLowerCase(),
          })}
        />
        <PrimaryButton
          testID="supplier-saved-continue"
          label={t("supplierForm.viewSupplier")}
          icon="arrow-right"
          onPress={() => onSaved(saved)}
        />
        <TextButton label={t("supplierForm.backToSuppliers")} onPress={onBack} />
      </ScrollScreen>
    );
  }

  // useMutation already stores a ClassifiedCommerceError — use it directly (never re-classify).
  const submitError = mutation.state.status === "error" ? mutation.state.error : null;

  return (
    <ScrollScreen>
      <PageTitle mode={mode} onBack={onBack} />
      <FormSection title={t("supplierForm.identitySection")} icon="badge-account-outline">
        <TextField
          label={t("supplierForm.name")}
          value={name}
          onChangeText={(next) => {
            setName(next);
            clearError("name");
          }}
          placeholder={t("supplierForm.namePlaceholder")}
          testID="supplier-name"
          autoCapitalize="words"
          required
          error={errors.name}
        />
        <TextField
          label={t("supplierForm.refCode")}
          value={referenceCode}
          onChangeText={(next) => {
            setReferenceCode(next);
            clearError("referenceCode");
          }}
          placeholder={t("supplierForm.refPlaceholder")}
          testID="supplier-reference"
          autoCapitalize="characters"
          error={errors.referenceCode}
        />
        <SelectField
          label={t("supplierForm.status")}
          options={statusOptions}
          selected={status}
          onSelect={(value) => setStatus(value as SupplierStatus)}
          testIDPrefix="supplier-status"
        />
      </FormSection>

      <FormSection title={t("supplierForm.contactSection")} icon="card-account-phone-outline">
        <TextField
          label={t("supplierForm.contactPerson")}
          value={contactPerson}
          onChangeText={(next) => {
            setContactPerson(next);
            clearError("contactPerson");
          }}
          testID="supplier-contact"
          autoCapitalize="words"
          error={errors.contactPerson}
        />
        <TextField
          label={t("supplierForm.phone")}
          value={phone}
          onChangeText={(next) => {
            setPhone(next);
            clearError("phone");
          }}
          placeholder="+20 10 0000 0000"
          testID="supplier-phone"
          autoCapitalize="none"
          error={errors.phone}
        />
        <TextField
          label={t("supplierForm.email")}
          value={email}
          onChangeText={(next) => {
            setEmail(next);
            clearError("email");
          }}
          placeholder={t("supplierForm.emailPlaceholder")}
          testID="supplier-email"
          autoCapitalize="none"
          error={errors.email}
        />
      </FormSection>

      <FormSection title={t("supplierForm.addressSection")} icon="map-marker-outline">
        <TextField
          label={t("supplierForm.address")}
          value={address}
          onChangeText={(next) => {
            setAddress(next);
            clearError("address");
          }}
          placeholder={t("supplierForm.addressPlaceholder")}
          testID="supplier-address"
          multiline
          error={errors.address}
        />
        <TextField
          label={t("supplierForm.notes")}
          value={notes}
          onChangeText={(next) => {
            setNotes(next);
            clearError("notes");
          }}
          placeholder={t("supplierForm.notesPlaceholder")}
          testID="supplier-notes"
          multiline
          error={errors.notes}
        />
      </FormSection>

      {submitError ? (
        <SubmitError described={describeSupplierWriteError(submitError)} mutation={mutation} />
      ) : null}

      <PrimaryButton
        label={
          mutation.state.status === "submitting"
            ? t("common.saving")
            : mode === "create"
              ? t("supplierForm.createSupplier")
              : t("common.saveChanges")
        }
        testID="supplier-submit"
        icon={mode === "create" ? "account-plus-outline" : "content-save-outline"}
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </ScrollScreen>
  );
}

function PageTitle({ mode, onBack }: { mode: SupplierFormMode; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <PageHeader
      eyebrow={t("suppliers.title")}
      title={mode === "create" ? t("supplierForm.newTitle") : t("supplierForm.editTitle")}
      description={t("supplierForm.desc")}
      icon={mode === "create" ? "account-plus-outline" : "pencil-outline"}
      onBack={onBack}
    />
  );
}

function SubmitError({
  described,
  mutation,
}: {
  described: ReturnType<typeof describeSupplierWriteError>;
  mutation: Mutation<SupplierDraft, Supplier>;
}) {
  const { t } = useI18n();
  return (
    <Notice
      testID="supplier-submit-error"
      tone="danger"
      title={described.heading}
      message={described.message}
      action={
        described.recovery === "retry" ? (
          <PrimaryButton
            label={t("common.retry")}
            icon="refresh"
            testID="supplier-submit-retry"
            onPress={() => mutation.retry()}
          />
        ) : described.recovery === "edit" ? (
          <PrimaryButton
            label={t("supplierForm.editAndRetry")}
            icon="pencil-outline"
            testID="supplier-submit-edit"
            onPress={() => mutation.reset()}
          />
        ) : (
          <TextButton label={t("common.dismiss")} onPress={() => mutation.reset()} />
        )
      }
    />
  );
}

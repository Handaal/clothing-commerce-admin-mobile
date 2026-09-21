import { useState } from "react";
import { View } from "react-native";

import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  Body,
  Divider,
  Eyebrow,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  type SelectOption,
  TextButton,
  TextField,
  Title,
} from "../ui/components";
import { useMutation, type Mutation } from "../ui/useMutation";
import type { SupplierAdapter } from "./adapter";
import {
  hasSupplierErrors,
  normalizeSupplierDraft,
  validateSupplierDraft,
  type Supplier,
  type SupplierAddress,
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

const STATUS_OPTIONS: SelectOption[] = (["active", "inactive"] as SupplierStatus[]).map(
  (value) => ({ value, label: supplierStatusLabel(value) }),
);

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
  const address = initial?.address;

  const [name, setName] = useState(initial?.name ?? "");
  const [referenceCode, setReferenceCode] = useState(initial?.referenceCode ?? "");
  const [contactPerson, setContactPerson] = useState(initial?.contactPerson ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [line1, setLine1] = useState(address?.line1 ?? "");
  const [line2, setLine2] = useState(address?.line2 ?? "");
  const [city, setCity] = useState(address?.city ?? "");
  const [region, setRegion] = useState(address?.region ?? "");
  const [postalCode, setPostalCode] = useState(address?.postalCode ?? "");
  const [countryCode, setCountryCode] = useState(address?.countryCode ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<SupplierStatus>(initial?.status ?? "active");
  const [errors, setErrors] = useState<SupplierFieldErrors>({});

  const mutation = useMutation<SupplierDraft, Supplier>(
    (draft, key) =>
      mode === "create"
        ? adapter.createSupplier(draft, key)
        : adapter.updateSupplier((initial as Supplier).id, draft, key),
    generateKey,
  );

  function currentDraft(): SupplierDraft {
    const addressDraft: SupplierAddress = { line1, line2, city, region, postalCode, countryCode };
    return normalizeSupplierDraft({
      name,
      referenceCode,
      contactPerson,
      phone,
      email,
      address: addressDraft,
      notes,
      status,
    });
  }

  function onSubmit() {
    const draft = currentDraft();
    const found = validateSupplierDraft(draft);
    setErrors(found);
    if (hasSupplierErrors(found)) return;
    mutation.submit(draft);
  }

  if (mutation.state.status === "success") {
    const saved = mutation.state.data;
    return (
      <ScrollScreen>
        <PageTitle mode={mode} onBack={onBack} />
        <Divider />
        <Body>
          “{saved.name}” was {mode === "create" ? "created" : "updated"} as a{" "}
          {supplierStatusLabel(saved.status).toLowerCase()} supplier.
        </Body>
        <PrimaryButton
          testID="supplier-saved-continue"
          label="View supplier"
          onPress={() => onSaved(saved)}
        />
        <TextButton label="Back to suppliers" onPress={onBack} />
      </ScrollScreen>
    );
  }

  // useMutation already stores a ClassifiedCommerceError — use it directly (never re-classify).
  const submitError = mutation.state.status === "error" ? mutation.state.error : null;

  return (
    <ScrollScreen>
      <PageTitle mode={mode} onBack={onBack} />
      <Divider />

      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Nile Textiles Co."
        testID="supplier-name"
        autoCapitalize="words"
      />
      <FieldError message={errors.name} testID="supplier-name-error" />

      <TextField
        label="Reference code (optional)"
        value={referenceCode}
        onChangeText={setReferenceCode}
        placeholder="e.g. SUP-014"
        testID="supplier-reference"
        autoCapitalize="characters"
      />
      <FieldError message={errors.referenceCode} testID="supplier-reference-error" />

      <SelectField
        label="Status"
        options={STATUS_OPTIONS}
        selected={status}
        onSelect={(value) => setStatus(value as SupplierStatus)}
        testIDPrefix="supplier-status"
      />

      <Divider />
      <Eyebrow>Contact</Eyebrow>
      <TextField
        label="Contact person (optional)"
        value={contactPerson}
        onChangeText={setContactPerson}
        testID="supplier-contact"
        autoCapitalize="words"
      />
      <FieldError message={errors.contactPerson} testID="supplier-contact-error" />
      <TextField
        label="Phone (optional)"
        value={phone}
        onChangeText={setPhone}
        placeholder="+20 10 0000 0000"
        testID="supplier-phone"
        autoCapitalize="none"
      />
      <FieldError message={errors.phone} testID="supplier-phone-error" />
      <TextField
        label="Email (optional)"
        value={email}
        onChangeText={setEmail}
        placeholder="orders@supplier.example"
        testID="supplier-email"
        autoCapitalize="none"
      />
      <FieldError message={errors.email} testID="supplier-email-error" />

      <Divider />
      <Eyebrow>Address</Eyebrow>
      <TextField
        label="Address line 1 (optional)"
        value={line1}
        onChangeText={setLine1}
        testID="supplier-line1"
      />
      <TextField
        label="Address line 2 (optional)"
        value={line2}
        onChangeText={setLine2}
        testID="supplier-line2"
      />
      <TextField
        label="City (optional)"
        value={city}
        onChangeText={setCity}
        testID="supplier-city"
      />
      <TextField
        label="Region (optional)"
        value={region}
        onChangeText={setRegion}
        testID="supplier-region"
      />
      <TextField
        label="Postal code (optional)"
        value={postalCode}
        onChangeText={setPostalCode}
        testID="supplier-postal"
        autoCapitalize="characters"
      />
      <TextField
        label="Country code (optional)"
        value={countryCode}
        onChangeText={setCountryCode}
        placeholder="EG"
        testID="supplier-country"
        autoCapitalize="characters"
      />

      <Divider />
      <TextField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Internal notes about this supplier."
        testID="supplier-notes"
        multiline
      />
      <FieldError message={errors.notes} testID="supplier-notes-error" />

      {submitError ? (
        <SubmitError described={describeSupplierWriteError(submitError)} mutation={mutation} />
      ) : null}

      <PrimaryButton
        label={
          mutation.state.status === "submitting"
            ? "Saving…"
            : mode === "create"
              ? "Create supplier"
              : "Save changes"
        }
        testID="supplier-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </ScrollScreen>
  );
}

function PageTitle({ mode, onBack }: { mode: SupplierFormMode; onBack: () => void }) {
  return (
    <PageHeader
      eyebrow="Suppliers"
      title={mode === "create" ? "New supplier" : "Edit supplier"}
      onBack={onBack}
    />
  );
}

function FieldError({ message, testID }: { message?: string; testID: string }) {
  if (!message) return null;
  return <Body testID={testID}>{message}</Body>;
}

function SubmitError({
  described,
  mutation,
}: {
  described: ReturnType<typeof describeSupplierWriteError>;
  mutation: Mutation<SupplierDraft, Supplier>;
}) {
  return (
    <View style={{ gap: 8 }} testID="supplier-submit-error">
      <Title>{described.heading}</Title>
      <Body>{described.message}</Body>
      {described.recovery === "retry" ? (
        // Ambiguous failure: retry reuses the SAME idempotency key (at-most-once at the API).
        <PrimaryButton
          label="Retry"
          testID="supplier-submit-retry"
          onPress={() => mutation.retry()}
        />
      ) : described.recovery === "edit" ? (
        <PrimaryButton
          label="Edit and try again"
          testID="supplier-submit-edit"
          onPress={() => mutation.reset()}
        />
      ) : (
        <TextButton label="Dismiss" onPress={() => mutation.reset()} />
      )}
    </View>
  );
}

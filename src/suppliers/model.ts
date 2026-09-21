/**
 * Phase 2N Supplier domain model — Admin-Mobile-owned, deliberately independent of any future SDK DTO.
 *
 * The Supplier API/SDK does not exist yet (Codex ships "Supplier Core" later). This file defines the
 * UX-facing shape the foundation is built against, so that final SDK integration is a NARROW mapping
 * (SDK DTO → this model) rather than a rewrite. It invents NO API property names and NO wire fields;
 * these names are the app's own vocabulary. Normalization/validation here are UX conveniences only —
 * the eventual API remains the sole authority for persistence, uniqueness and business rules.
 */

export type SupplierStatus = "active" | "inactive";

/** The editable Supplier fields captured by the create/edit form. */
export interface SupplierDraft {
  name: string;
  referenceCode?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  /**
   * Free-form postal address as one string. The canonical API stores the Supplier address as a single
   * text field, so V1 captures and round-trips it verbatim rather than parsing structured parts. See
   * `docs/phase-2n-foundation.md` — structured address fields are deferred unless the API adds them.
   */
  address?: string;
  notes?: string;
  status: SupplierStatus;
}

/**
 * A fully realized Supplier as an adapter would return it. `createdAt`/`updatedAt` are optional
 * metadata surfaced only once the API actually supplies them — never fabricated by the client.
 */
export interface Supplier extends SupplierDraft {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}

/** The compact shape a Supplier list row needs (a projection of {@link Supplier}). */
export interface SupplierSummary {
  id: string;
  name: string;
  referenceCode?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  status: SupplierStatus;
}

/** One line of a supplier-linked inventory receipt (receiving-history shell). */
export interface SupplierReceiptLine {
  productName?: string;
  sku?: string;
  variantId?: string;
  quantity: number;
}

/**
 * A supplier-linked inventory receipt as the canonical Supplier receipt history will eventually
 * supply it. This is the UI shell only; it is NOT a second inventory ledger — the app never
 * reconstructs receipts client-side.
 */
export interface SupplierReceipt {
  id: string;
  receivedAt: string;
  locationId?: string;
  locationName?: string;
  reference?: string;
  actor?: string;
  lines: SupplierReceiptLine[];
}

/**
 * UX field-length caps. They keep input sane before submit; the API enforces the authoritative limits.
 * Kept intentionally generous so the client never rejects something the server would accept.
 */
export const SUPPLIER_FIELD_LIMITS = {
  name: 120,
  referenceCode: 40,
  contactPerson: 120,
  phone: 40,
  email: 254,
  // Matches the canonical API's `address` cap (optionalText(1000)); the server stays authoritative.
  address: 1000,
  notes: 2000,
} as const;

export type SupplierField =
  "name" | "referenceCode" | "contactPerson" | "phone" | "email" | "address" | "notes";

export type SupplierFieldErrors = Partial<Record<SupplierField, string>>;

// Deliberately permissive: any address-ish local part @ domain with a dot. The API is authoritative.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Digits are required; +, spaces, hyphens, parentheses and dots are tolerated formatting.
const PHONE_ALLOWED = /^[+()\-.\s\d]+$/;

function trimOrUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Local, pre-submit validation. Convenience only — the API re-checks every rule. `null` means "no
 * local objection"; a string is a human message. Mirrors the inventory `validate*` convention.
 */
export function validateSupplierName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Supplier name is required.";
  if (trimmed.length > SUPPLIER_FIELD_LIMITS.name) {
    return `Keep the name to ${SUPPLIER_FIELD_LIMITS.name} characters or fewer.`;
  }
  return null;
}

/** Email is optional; when supplied it must look like an address and fit the length cap. */
export function validateSupplierEmail(email: string | undefined): string | null {
  const value = trimOrUndefined(email);
  if (value === undefined) return null;
  if (value.length > SUPPLIER_FIELD_LIMITS.email) {
    return `Keep the email to ${SUPPLIER_FIELD_LIMITS.email} characters or fewer.`;
  }
  if (!EMAIL_PATTERN.test(value)) return "Enter a valid email address.";
  return null;
}

/** Phone is optional; when supplied it must be plausibly a phone number (UX-focused, not strict E.164). */
export function validateSupplierPhone(phone: string | undefined): string | null {
  const value = trimOrUndefined(phone);
  if (value === undefined) return null;
  if (value.length > SUPPLIER_FIELD_LIMITS.phone) {
    return `Keep the phone number to ${SUPPLIER_FIELD_LIMITS.phone} characters or fewer.`;
  }
  if (!PHONE_ALLOWED.test(value)) {
    return "Use only digits and phone punctuation ( + - ( ) . ).";
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return "Enter a longer phone number.";
  return null;
}

function validateOptionalLength(
  value: string | undefined,
  limit: number,
  label: string,
): string | null {
  const trimmed = trimOrUndefined(value);
  if (trimmed === undefined) return null;
  if (trimmed.length > limit) return `Keep the ${label} to ${limit} characters or fewer.`;
  return null;
}

export function validateSupplierReferenceCode(referenceCode: string | undefined): string | null {
  return validateOptionalLength(
    referenceCode,
    SUPPLIER_FIELD_LIMITS.referenceCode,
    "reference code",
  );
}

export function validateSupplierContactPerson(contactPerson: string | undefined): string | null {
  return validateOptionalLength(contactPerson, SUPPLIER_FIELD_LIMITS.contactPerson, "contact name");
}

/** Address is optional free-form text; the only local check is the length cap. */
export function validateSupplierAddress(address: string | undefined): string | null {
  return validateOptionalLength(address, SUPPLIER_FIELD_LIMITS.address, "address");
}

export function validateSupplierNotes(notes: string | undefined): string | null {
  return validateOptionalLength(notes, SUPPLIER_FIELD_LIMITS.notes, "notes");
}

/** Validate every field, returning a field-keyed map (empty when the draft is locally acceptable). */
export function validateSupplierDraft(draft: SupplierDraft): SupplierFieldErrors {
  const errors: SupplierFieldErrors = {};
  const name = validateSupplierName(draft.name);
  if (name) errors.name = name;
  const referenceCode = validateSupplierReferenceCode(draft.referenceCode);
  if (referenceCode) errors.referenceCode = referenceCode;
  const contactPerson = validateSupplierContactPerson(draft.contactPerson);
  if (contactPerson) errors.contactPerson = contactPerson;
  const phone = validateSupplierPhone(draft.phone);
  if (phone) errors.phone = phone;
  const email = validateSupplierEmail(draft.email);
  if (email) errors.email = email;
  const address = validateSupplierAddress(draft.address);
  if (address) errors.address = address;
  const notes = validateSupplierNotes(draft.notes);
  if (notes) errors.notes = notes;
  return errors;
}

export function hasSupplierErrors(errors: SupplierFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Produce the canonical draft to submit: trim every string, drop empty optionals entirely (so the
 * adapter never sends `""`), and lowercase the email. The address is trimmed free-form text — its
 * internal newlines are preserved so a multiline address survives verbatim. Required `name` and
 * `status` are always present. This is the single shape the submit seam receives.
 */
export function normalizeSupplierDraft(draft: SupplierDraft): SupplierDraft {
  const normalized: SupplierDraft = {
    name: draft.name.trim(),
    status: draft.status,
  };
  const referenceCode = trimOrUndefined(draft.referenceCode);
  const contactPerson = trimOrUndefined(draft.contactPerson);
  const phone = trimOrUndefined(draft.phone);
  const email = trimOrUndefined(draft.email);
  const address = trimOrUndefined(draft.address);
  const notes = trimOrUndefined(draft.notes);
  if (referenceCode) normalized.referenceCode = referenceCode;
  if (contactPerson) normalized.contactPerson = contactPerson;
  if (phone) normalized.phone = phone;
  if (email) normalized.email = email.toLowerCase();
  if (address) normalized.address = address;
  if (notes) normalized.notes = notes;
  return normalized;
}

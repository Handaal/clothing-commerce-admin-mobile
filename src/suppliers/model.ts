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

/** A postal address, all parts optional — different suppliers carry different amounts of detail. */
export interface SupplierAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  /** ISO-3166 alpha-2 as a UX hint (e.g. "EG"); the API validates the real thing. */
  countryCode?: string;
}

/** The editable Supplier fields captured by the create/edit form. */
export interface SupplierDraft {
  name: string;
  referenceCode?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: SupplierAddress;
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
  addressLine: 120,
  city: 80,
  region: 80,
  postalCode: 20,
  countryCode: 2,
  notes: 2000,
} as const;

export type SupplierField =
  "name" | "referenceCode" | "contactPerson" | "phone" | "email" | "notes";

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
  const notes = validateSupplierNotes(draft.notes);
  if (notes) errors.notes = notes;
  return errors;
}

export function hasSupplierErrors(errors: SupplierFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

function normalizeAddress(address: SupplierAddress | undefined): SupplierAddress | undefined {
  if (!address) return undefined;
  const next: SupplierAddress = {};
  const line1 = trimOrUndefined(address.line1);
  const line2 = trimOrUndefined(address.line2);
  const city = trimOrUndefined(address.city);
  const region = trimOrUndefined(address.region);
  const postalCode = trimOrUndefined(address.postalCode);
  const countryCode = trimOrUndefined(address.countryCode);
  if (line1) next.line1 = line1;
  if (line2) next.line2 = line2;
  if (city) next.city = city;
  if (region) next.region = region;
  if (postalCode) next.postalCode = postalCode;
  if (countryCode) next.countryCode = countryCode.toUpperCase();
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Produce the canonical draft to submit: trim every string, drop empty optionals entirely (so the
 * adapter never sends `""`), lowercase the email and uppercase the country code. Required `name` and
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
  const notes = trimOrUndefined(draft.notes);
  const address = normalizeAddress(draft.address);
  if (referenceCode) normalized.referenceCode = referenceCode;
  if (contactPerson) normalized.contactPerson = contactPerson;
  if (phone) normalized.phone = phone;
  if (email) normalized.email = email.toLowerCase();
  if (notes) normalized.notes = notes;
  if (address) normalized.address = address;
  return normalized;
}

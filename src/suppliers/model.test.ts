import { describe, expect, it } from "vitest";

import {
  hasSupplierErrors,
  normalizeSupplierDraft,
  SUPPLIER_FIELD_LIMITS,
  validateSupplierDraft,
  validateSupplierEmail,
  validateSupplierName,
  validateSupplierPhone,
  type SupplierDraft,
} from "./model";

function draft(overrides: Partial<SupplierDraft> = {}): SupplierDraft {
  return { name: "Nile Textiles", status: "active", ...overrides };
}

describe("supplier name validation", () => {
  it("requires a non-empty name", () => {
    expect(validateSupplierName("")).toMatch(/required/);
    expect(validateSupplierName("   ")).toMatch(/required/);
  });

  it("accepts a normal name", () => {
    expect(validateSupplierName("Nile Textiles")).toBeNull();
  });

  it("rejects a name past the length cap", () => {
    expect(validateSupplierName("x".repeat(SUPPLIER_FIELD_LIMITS.name + 1))).toMatch(/characters/);
  });
});

describe("supplier email validation", () => {
  it("treats a missing email as acceptable (optional)", () => {
    expect(validateSupplierEmail(undefined)).toBeNull();
    expect(validateSupplierEmail("")).toBeNull();
    expect(validateSupplierEmail("   ")).toBeNull();
  });

  it("rejects a malformed email when supplied", () => {
    expect(validateSupplierEmail("not-an-email")).toMatch(/valid email/);
    expect(validateSupplierEmail("a@b")).toMatch(/valid email/);
  });

  it("accepts a well-formed email", () => {
    expect(validateSupplierEmail("orders@supplier.example")).toBeNull();
  });
});

describe("supplier phone validation", () => {
  it("is optional", () => {
    expect(validateSupplierPhone(undefined)).toBeNull();
    expect(validateSupplierPhone("")).toBeNull();
  });

  it("accepts common phone punctuation", () => {
    expect(validateSupplierPhone("+20 (10) 1234-5678")).toBeNull();
  });

  it("rejects letters and too-short numbers", () => {
    expect(validateSupplierPhone("call me")).toMatch(/digits/);
    expect(validateSupplierPhone("12")).toMatch(/longer/);
  });
});

describe("validateSupplierDraft", () => {
  it("returns no errors for a clean draft", () => {
    const errors = validateSupplierDraft(draft({ email: "a@b.co", phone: "+201234567" }));
    expect(hasSupplierErrors(errors)).toBe(false);
  });

  it("collects errors per field", () => {
    const errors = validateSupplierDraft(draft({ name: "", email: "bad", phone: "xx" }));
    expect(errors.name).toBeDefined();
    expect(errors.email).toBeDefined();
    expect(errors.phone).toBeDefined();
    expect(hasSupplierErrors(errors)).toBe(true);
  });
});

describe("normalizeSupplierDraft", () => {
  it("trims strings and drops empty optionals so the adapter never sends blanks", () => {
    const result = normalizeSupplierDraft(
      draft({
        name: "  Nile Textiles  ",
        referenceCode: "  ",
        contactPerson: "  Mona  ",
        phone: "  ",
        email: "  ORDERS@Supplier.Example  ",
        notes: "   ",
      }),
    );
    expect(result.name).toBe("Nile Textiles");
    expect(result.referenceCode).toBeUndefined();
    expect(result.contactPerson).toBe("Mona");
    expect(result.phone).toBeUndefined();
    // Email is normalized to lowercase.
    expect(result.email).toBe("orders@supplier.example");
    expect(result.notes).toBeUndefined();
  });

  it("normalizes the address, uppercasing country code and dropping an all-empty address", () => {
    const withAddress = normalizeSupplierDraft(
      draft({ address: { line1: " 10 Main ", countryCode: " eg " } }),
    );
    expect(withAddress.address).toEqual({ line1: "10 Main", countryCode: "EG" });

    const emptyAddress = normalizeSupplierDraft(draft({ address: { line1: "  ", city: "" } }));
    expect(emptyAddress.address).toBeUndefined();
  });

  it("always keeps required name and status", () => {
    const result = normalizeSupplierDraft(draft({ status: "inactive" }));
    expect(result.name).toBe("Nile Textiles");
    expect(result.status).toBe("inactive");
  });
});

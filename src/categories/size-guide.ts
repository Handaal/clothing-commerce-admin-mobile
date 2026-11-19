import type { SizeGuide } from "@shifted/clothing-commerce-sdk";

/**
 * Phone-friendly text form of a category size guide (SDK 0.46). Admins type the measurement names as a
 * comma list ("Chest, Length") and one line per size ("M: 100-104, 72"). These pure helpers convert
 * between that text and the API shape and explain problems in plain words; the API validates again.
 */

export interface SizeGuideDraft {
  title: string;
  unit: "cm" | "in";
  columns: string;
  rows: string;
  note: string;
}

export const MAX_COLUMNS = 8;
export const MAX_ROWS = 30;

export type SizeGuideProblem =
  | { kind: "no-columns" }
  | { kind: "too-many-columns" }
  | { kind: "no-rows" }
  | { kind: "too-many-rows" }
  | { kind: "missing-size"; line: number }
  | { kind: "value-count"; line: number; size: string; expected: number; found: number }
  | { kind: "duplicate-size"; size: string }
  | { kind: "too-long"; line: number };

export const EMPTY_DRAFT: SizeGuideDraft = {
  title: "",
  unit: "cm",
  columns: "",
  rows: "",
  note: "",
};

const splitList = (text: string) => text.split(",").map((part) => part.trim());

export function draftFromGuide(guide: SizeGuide | null | undefined): SizeGuideDraft {
  if (!guide) return EMPTY_DRAFT;
  return {
    title: guide.title ?? "",
    unit: guide.unit,
    columns: guide.columns.join(", "),
    rows: guide.rows.map((row) => `${row.size}: ${row.values.join(", ")}`).join("\n"),
    note: guide.note ?? "",
  };
}

export type ParseResult = { ok: true; guide: SizeGuide } | { ok: false; problem: SizeGuideProblem };

export function parseDraft(draft: SizeGuideDraft): ParseResult {
  const columns = splitList(draft.columns).filter(Boolean);
  if (columns.length === 0) return { ok: false, problem: { kind: "no-columns" } };
  if (columns.length > MAX_COLUMNS) return { ok: false, problem: { kind: "too-many-columns" } };

  const lines = draft.rows
    .split(/\r?\n/u)
    .map((text, index) => ({ text: text.trim(), line: index + 1 }))
    .filter((entry) => entry.text.length > 0);
  if (lines.length === 0) return { ok: false, problem: { kind: "no-rows" } };
  if (lines.length > MAX_ROWS) return { ok: false, problem: { kind: "too-many-rows" } };

  const rows: SizeGuide["rows"] = [];
  const seen = new Set<string>();
  for (const { text, line } of lines) {
    const colon = text.indexOf(":");
    const size = (colon === -1 ? "" : text.slice(0, colon)).trim();
    if (!size) return { ok: false, problem: { kind: "missing-size", line } };
    const values = splitList(text.slice(colon + 1));
    // "M:" alone means "no measurements yet" for every column.
    const filled = values.length === 1 && values[0] === "" ? columns.map(() => "") : values;
    if (filled.length !== columns.length) {
      return {
        ok: false,
        problem: {
          kind: "value-count",
          line,
          size,
          expected: columns.length,
          found: filled.length,
        },
      };
    }
    if (size.length > 24 || filled.some((value) => value.length > 24)) {
      return { ok: false, problem: { kind: "too-long", line } };
    }
    const key = size.toLowerCase();
    if (seen.has(key)) return { ok: false, problem: { kind: "duplicate-size", size } };
    seen.add(key);
    rows.push({ size, values: filled });
  }

  return {
    ok: true,
    guide: {
      title: draft.title.trim() ? draft.title.trim().slice(0, 120) : null,
      unit: draft.unit,
      columns: columns.map((column) => column.slice(0, 40)),
      rows,
      note: draft.note.trim() ? draft.note.trim().slice(0, 500) : null,
    },
  };
}

/** Starter layouts; measurements are left blank for the admin to fill in. */
export const SIZE_GUIDE_TEMPLATES = {
  tops: { columns: "Chest, Length, Shoulder", sizes: ["S", "M", "L", "XL", "XXL"] },
  bottoms: { columns: "Waist, Hip, Inseam", sizes: ["30", "32", "34", "36", "38"] },
} as const;

export type SizeGuideTemplate = keyof typeof SIZE_GUIDE_TEMPLATES;

export function templateDraft(
  template: SizeGuideTemplate,
  current: SizeGuideDraft,
): SizeGuideDraft {
  const layout = SIZE_GUIDE_TEMPLATES[template];
  const blanks = splitList(layout.columns)
    .map(() => "")
    .join(", ");
  return {
    ...current,
    columns: layout.columns,
    rows: layout.sizes.map((size) => `${size}: ${blanks}`).join("\n"),
  };
}

import { describe, expect, it } from "vitest";

import { EMPTY_DRAFT, draftFromGuide, parseDraft, templateDraft } from "./size-guide";

const draft = {
  title: " Tops ",
  unit: "cm" as const,
  columns: "Chest, Length",
  rows: "S: 96-100, 70\n\nM: 100-104, 72\n",
  note: "",
};

describe("parseDraft", () => {
  it("builds the API shape from text", () => {
    expect(parseDraft(draft)).toEqual({
      ok: true,
      guide: {
        title: "Tops",
        unit: "cm",
        columns: ["Chest", "Length"],
        rows: [
          { size: "S", values: ["96-100", "70"] },
          { size: "M", values: ["100-104", "72"] },
        ],
        note: null,
      },
    });
  });

  it("round-trips through draftFromGuide", () => {
    const parsed = parseDraft(draft);
    if (!parsed.ok) throw new Error("expected ok");
    expect(parseDraft(draftFromGuide(parsed.guide))).toEqual(parsed);
    expect(draftFromGuide(null)).toEqual(EMPTY_DRAFT);
  });

  it("explains problems by line", () => {
    expect(parseDraft({ ...draft, columns: " , " })).toEqual({
      ok: false,
      problem: { kind: "no-columns" },
    });
    expect(parseDraft({ ...draft, rows: "" })).toEqual({ ok: false, problem: { kind: "no-rows" } });
    expect(parseDraft({ ...draft, rows: "S: 96\n" })).toEqual({
      ok: false,
      problem: { kind: "value-count", line: 1, size: "S", expected: 2, found: 1 },
    });
    expect(parseDraft({ ...draft, rows: "S 96, 70" })).toEqual({
      ok: false,
      problem: { kind: "missing-size", line: 1 },
    });
    expect(parseDraft({ ...draft, rows: "S: 1, 2\ns: 3, 4" })).toEqual({
      ok: false,
      problem: { kind: "duplicate-size", size: "s" },
    });
  });

  it("treats a bare size as blank measurements", () => {
    const parsed = parseDraft({ ...draft, rows: "XL:" });
    expect(parsed.ok && parsed.guide.rows).toEqual([{ size: "XL", values: ["", ""] }]);
  });
});

describe("templateDraft", () => {
  it("fills columns and blank size lines that parse", () => {
    const next = templateDraft("bottoms", EMPTY_DRAFT);
    expect(next.columns).toBe("Waist, Hip, Inseam");
    const parsed = parseDraft(next);
    expect(parsed.ok && parsed.guide.rows.map((row) => row.size)).toEqual([
      "30",
      "32",
      "34",
      "36",
      "38",
    ]);
  });
});

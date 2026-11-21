import test from "node:test";
import assert from "node:assert/strict";
import {
  csvCell,
  csvDocument,
} from "../apps/attendance-service/src/attendance/csv-policy.ts";

test("CSV quotes embedded double quotes and commas", () => {
  assert.equal(csvCell('A, "B"'), '"A, ""B"""');
});

test("CSV defuses spreadsheet formulas with and without whitespace", () => {
  assert.equal(csvCell("=2+2"), '"\'=2+2"');
  assert.equal(csvCell("  +SUM(A1)"), '"\'  +SUM(A1)"');
  assert.equal(csvCell("@cmd"), '"\'@cmd"');
});

test("CSV exports BOM and Indonesian header", () => {
  const document = csvDocument([
    ["Tanggal", "Nama"],
    ["2026-11-22", "Andi"],
  ]);
  assert.equal(document.startsWith('\uFEFF"Tanggal","Nama"\r\n'), true);
});

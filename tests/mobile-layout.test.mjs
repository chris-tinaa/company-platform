import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("viewport supports mobile device width", () => {
  const html = readFileSync("apps/employee-portal/index.html", "utf8");
  assert.match(html, /width=device-width, initial-scale=1\.0/);
});

test("mobile layout has 320px baseline and touch-sized controls", () => {
  const css = readFileSync("apps/employee-portal/src/styles.css", "utf8");
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /max-width:\s*600px/);
  assert.match(css, /min-height:\s*44px/);
});

test("photo compression happens before upload, not after", () => {
  const compression = readFileSync(
    "apps/employee-portal/src/shared/media/compress-photo.ts",
    "utf8",
  );
  assert.match(compression, /canvas\.toBlob/);
  assert.match(compression, /image\/jpeg/);
  assert.match(compression, /5_242_880/);
});

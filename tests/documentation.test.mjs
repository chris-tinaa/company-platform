import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("README explains actual local install migration seed and tests", () => {
  const readme = read("README.md");
  for (const command of [
    "pnpm setup:local",
    "pnpm install",
    "pnpm dev:infra",
    "pnpm db:migrate",
    "pnpm db:seed",
    "pnpm dev",
    "pnpm test:unit",
    "pnpm test:smoke",
  ]) {
    assert.ok(readme.includes(command), `Missing ${command}`);
  }
  assert.match(readme, /belum terverifikasi|belum dapat diverifikasi/i);
  assert.match(readme, /kompresi foto/i);
  assert.match(readme, /mobile|ponsel/i);
});

test("local test runbook covers cookie login and employee check-in", () => {
  const guide = read("docs/LOCAL_TEST_STEPS.md");
  for (const text of [
    "HR001",
    "EMP001",
    "HttpOnly",
    "Absen Sekarang",
    "Coba Lagi",
    "pnpm test:smoke",
  ]) {
    assert.ok(guide.includes(text), `Missing ${text}`);
  }
});

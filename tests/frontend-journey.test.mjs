import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function text(path) {
  return readFileSync(`apps/employee-portal/src/${path}`, "utf8");
}

test("Indonesian login offers two testing accounts and disabled password", () => {
  const source = text("modules/auth/LoginPage.tsx");
  assert.match(source, /HR001/);
  assert.match(source, /EMP001/);
  assert.match(source, /Kata Sandi/);
  assert.match(source, /disabled/);
  assert.match(source, /keperluan testing/);
});

test("frontend restores cookies without storing JWT in browser storage", () => {
  const source = text("app/AuthProvider.tsx");
  assert.match(source, /auth\/me/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|accessToken/);
});

test("camera photo is compressed before multipart upload", () => {
  const source = text("modules/attendance/CheckInPage.tsx");
  assert.match(source, /compressPhoto/);
  assert.match(source, /FormData/);
  assert.match(source, /Idempotency-Key/);
});

test("HR monitoring is read-only and employee directory supports CRUD", () => {
  const monitor = text("modules/attendance/HRReportPage.tsx");
  const employees = text("modules/employee/EmployeeDirectoryPage.tsx");
  assert.doesNotMatch(monitor, /api\.(post|patch|delete)\(/);
  assert.match(employees, /api\.post\(/);
  assert.match(employees, /api\.patch\(/);
  assert.match(employees, /api\.delete\(/);
});

test("mobile logout button has a readable accessible label", () => {
  const layout = readFileSync(
    "apps/employee-portal/src/layouts/AppLayout.tsx",
    "utf8",
  );
  assert.match(layout, /aria-label="Keluar"/);
});

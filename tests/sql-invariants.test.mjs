import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function sql(service) {
  return readFileSync(`apps/${service}/migrations/001_initial.sql`, "utf8");
}

test("attendance date and idempotency are unique for each employee", () => {
  const migration = sql("attendance-service");
  assert.match(
    migration,
    /UNIQUE KEY uq_attendance_employee_date \(employee_id, attendance_date\)/,
  );
  assert.match(
    migration,
    /UNIQUE KEY uq_attendance_employee_key \(employee_id, idempotency_key\)/,
  );
});

test("employee changes have an outbox in their database", () => {
  assert.match(
    sql("employee-service"),
    /CREATE TABLE IF NOT EXISTS outbox_events/,
  );
  assert.match(sql("employee-service"), /version BIGINT NOT NULL DEFAULT 1/);
});

test("auth has processed event deduplication and durable lifecycle version", () => {
  assert.match(sql("auth-service"), /processed_events/);
  assert.match(sql("auth-service"), /last_version BIGINT NOT NULL/);
});

test("document bytes and ownership have separate metadata fields", () => {
  const migration = sql("document-service");
  assert.match(migration, /subject_employee_id/);
  assert.match(migration, /uploader_employee_id/);
  assert.match(migration, /sha256/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isMasterCode, isPositionLevel, canAssignMaster } from '../apps/employee-service/src/masters/master-policy.ts';

// RED first: these behaviors did not exist in the previous source.
test('master codes reject spaces and SQL-like punctuation', () => {
  assert.equal(isMasterCode('HR_OPERATIONS'), true);
  assert.equal(isMasterCode('R&D'), false);
  assert.equal(isMasterCode(''), false);
  assert.equal(isMasterCode(' A'), false);
});

test('position level is a positive bounded integer', () => {
  assert.equal(isPositionLevel(1), true);
  assert.equal(isPositionLevel(20), true);
  for (const v of [0, -1, 21, 1.5, NaN, '2']) assert.equal(isPositionLevel(v), false);
});

test('assignment requires existing active department and position', () => {
  assert.equal(canAssignMaster(true, true), true);
  assert.equal(canAssignMaster(true, false), false);
  assert.equal(canAssignMaster(false, true), false);
});

test('auth migration normalizes roles without altering session generation', () => {
  const sql = readFileSync('apps/auth-service/migrations/004_roles.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS roles/);
  assert.match(sql, /ADD COLUMN role_id/);
  assert.match(sql, /JOIN roles/);
  assert.match(sql, /FOREIGN KEY \(role_id\) REFERENCES roles\(id\)/);
  assert.doesNotMatch(sql, /DROP COLUMN session_generation/);
});

test('employee migration preserves old text names when converting to masters', () => {
  const sql = readFileSync('apps/employee-service/migrations/003_department_position.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS departments/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS positions/);
  assert.match(sql, /`level` TINYINT UNSIGNED NOT NULL/);
  assert.match(sql, /JOIN departments d ON/);
  assert.match(sql, /JOIN positions p ON/);
  assert.match(sql, /FOREIGN KEY \(department_id\) REFERENCES departments\(id\)/);
  assert.match(sql, /FOREIGN KEY \(position_id\) REFERENCES positions\(id\)/);
});

test('all four services enable Swagger locally but not in production', () => {
  for (const svc of ['auth', 'employee', 'attendance', 'document']) {
    const base = `apps/${svc}-service`;
    const entry = readFileSync(`${base}/src/main.ts`, 'utf8');
    const manifest = JSON.parse(readFileSync(`${base}/package.json`, 'utf8'));
    assert.ok(manifest.dependencies['@nestjs/swagger']?.startsWith('11.'));
    assert.match(entry, /SwaggerModule\.setup/);
    assert.match(entry, /APP_ENV/);
    assert.match(entry, /SWAGGER_ENABLED/);
  }
});

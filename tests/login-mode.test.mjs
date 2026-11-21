import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLoginCredentials } from '../apps/employee-portal/src/modules/auth/login-mode.ts';

test('demo login only uses the fixed demo password in demo mode', () => {
  const demo = resolveLoginCredentials(true, 'demo', 'HR001', 'EMP100', 'OtherPassword!55', 'DemoAbsensi2026!');
  assert.deepEqual(demo, { userId: 'HR001', password: 'DemoAbsensi2026!' });
  const manual = resolveLoginCredentials(true, 'manual', 'HR001', ' EMP100 ', 'OtherPassword!55', 'DemoAbsensi2026!');
  assert.deepEqual(manual, { userId: 'EMP100', password: 'OtherPassword!55' });
  const live = resolveLoginCredentials(false, 'demo', 'HR001', 'EMP100', 'OtherPassword!55', 'DemoAbsensi2026!');
  assert.deepEqual(live, { userId: 'EMP100', password: 'OtherPassword!55' });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldApplyLifecycle, nextEventStatus } from '../apps/auth-service/src/lifecycle/lifecycle-policy.ts';

test('a newer deactivation wins against an older creation', () => {
  assert.equal(shouldApplyLifecycle(2, 1), false);
  assert.equal(shouldApplyLifecycle(1, 2), true);
});

test('duplicate lifecycle version is ignored', () => {
  assert.equal(shouldApplyLifecycle(2, 2), false);
});

test('created accounts remain pending until activated independently', () => {
  assert.equal(nextEventStatus('employee.created'), 'PENDING');
  assert.equal(nextEventStatus('employee.deactivated'), 'INACTIVE');
});

test('reactivation requires a new password and must not enable an old account', () => {
  assert.equal(nextEventStatus('employee.reactivated'), 'PENDING');
  assert.equal(shouldApplyLifecycle(4, 3), false);
  assert.equal(shouldApplyLifecycle(3, 4), true);
});

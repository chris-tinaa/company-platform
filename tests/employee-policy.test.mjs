import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldEmitDeactivation, canDeactivateEmployee } from '../apps/employee-service/src/employees/employee-policy.ts';

test('only first ACTIVE to INACTIVE emits a deactivation event', () => {
  assert.equal(shouldEmitDeactivation('ACTIVE'), true);
  assert.equal(shouldEmitDeactivation('INACTIVE'), false);
});

test('seeded demo identities cannot be deactivated', () => {
  assert.equal(canDeactivateEmployee('HR001'), false);
  assert.equal(canDeactivateEmployee('EMP001'), false);
  assert.equal(canDeactivateEmployee('EMP099'), true);
});

test('only inactive employee can start reactivation', async () => {
  const policy = await import('../apps/employee-service/src/employees/employee-policy.ts');
  assert.equal(typeof policy.shouldEmitReactivation, 'function');
  assert.equal(policy.shouldEmitReactivation('INACTIVE'), true);
  assert.equal(policy.shouldEmitReactivation('ACTIVE'), false);
});

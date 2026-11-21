import test from 'node:test';
import assert from 'node:assert/strict';
import { isStrongInitialPassword, canActivatePendingAccount } from '../apps/auth-service/src/auth/activation-policy.ts';

test('strong initial passwords need 12-72 UTF-8 bytes and four character classes', () => {
  assert.equal(isStrongInitialPassword('TempatKerja!2026'), true);
  assert.equal(isStrongInitialPassword('abcd1234!XYZ'), true);
  assert.equal(isStrongInitialPassword('Singkat!1'), false);
  assert.equal(isStrongInitialPassword('hurufkecil1234!'), false);
  assert.equal(isStrongInitialPassword('HURUFGEDE1234!'), false);
  assert.equal(isStrongInitialPassword('TanpaAngka!Tes'), false);
  assert.equal(isStrongInitialPassword('TanpaSimbol1234'), false);
  assert.equal(isStrongInitialPassword('Aa1!' + 'x'.repeat(69)), false);
  assert.equal(isStrongInitialPassword('Aa1!' + 'x'.repeat(68)), true);
  assert.equal(isStrongInitialPassword('Aa1!' + '✨'.repeat(24)), false);
});

test('only a pending account with active employee lifecycle can be activated', () => {
  assert.equal(canActivatePendingAccount('PENDING', 'ACTIVE'), true);
  assert.equal(canActivatePendingAccount('ACTIVE', 'ACTIVE'), false);
  assert.equal(canActivatePendingAccount('INACTIVE', 'ACTIVE'), false);
  assert.equal(canActivatePendingAccount('NOT_FOUND', 'ACTIVE'), false);
  assert.equal(canActivatePendingAccount('PENDING', 'INACTIVE'), false);
  assert.equal(canActivatePendingAccount('PENDING', null), false);
});

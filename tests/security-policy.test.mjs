import test from 'node:test';
import assert from 'node:assert/strict';
import { cookiePolicy, acceptsUnsafeRequest, readCookie } from '../apps/auth-service/src/security/security-policy.ts';

test('HTTPS sessions use a host-only HttpOnly cookie', () => {
  const session = cookiePolicy('demo', 'https://absensi.example.test');
  assert.equal(session.name, '__Host-access_token');
  assert.deepEqual(session.options, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 900000 });
});

test('localhost HTTP sessions use a non-secure development cookie', () => {
  const session = cookiePolicy('local', 'http://localhost:5173');
  assert.equal(session.name, 'access_token');
  assert.equal(session.options.secure, false);
});

test('public demo cannot boot without HTTPS cookies', () => {
  assert.throws(() => cookiePolicy('demo', 'http://example.test'), /HTTPS/);
});

test('unsafe writes require exact origin and custom marker', () => {
  assert.equal(acceptsUnsafeRequest('https://absensi.example.test', 'attendance-portal', 'https://absensi.example.test'), true);
  assert.equal(acceptsUnsafeRequest('https://untrusted.test', 'attendance-portal', 'https://absensi.example.test'), false);
  assert.equal(acceptsUnsafeRequest(undefined, 'attendance-portal', 'https://absensi.example.test'), false);
  assert.equal(acceptsUnsafeRequest('https://absensi.example.test', undefined, 'https://absensi.example.test'), false);
});

test('cookie parser distinguishes matching names', () => {
  assert.equal(readCookie('other=1; access_token=abc.def; next=3', 'access_token'), 'abc.def');
  assert.equal(readCookie('other=1; next=3', 'access_token'), null);
});

test('token generation from before deactivation is rejected after reactivation', async () => {
  const policy = await import('../apps/auth-service/src/security/security-policy.ts');
  assert.equal(typeof policy.isAccountSessionCurrent, 'function');
  assert.equal(typeof policy.isAccountReady, 'function');
  const session = policy.isAccountSessionCurrent;
  assert.equal(session('ACTIVE', 3, { eligible: true, sessionGeneration: 3 }, 1), false);
  assert.equal(session('ACTIVE', 3, { eligible: true, sessionGeneration: 3 }, 3), true);
  assert.equal(session('ACTIVE', 1, { eligible: true, sessionGeneration: 3 }, 1), false);
  assert.equal(session('ACTIVE', 3, { eligible: false, sessionGeneration: 3 }, 3), false);
  assert.equal(session('PENDING', 3, { eligible: true, sessionGeneration: 3 }, 3), false);
  assert.equal(policy.isAccountReady('ACTIVE', 3, { eligible: true, sessionGeneration: 3 }), true);
  assert.equal(policy.isAccountReady('ACTIVE', 1, { eligible: true, sessionGeneration: 3 }), false);
  assert.equal(session('ACTIVE', 3, { eligible: true, sessionGeneration: 3 }, undefined), false);
  assert.equal(session('ACTIVE', 3, { eligible: true, sessionGeneration: 3 }, '3'), false);
});

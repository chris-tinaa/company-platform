import test from 'node:test';
import assert from 'node:assert/strict';

const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
const base = process.env.API_BASE_URL ?? `${origin}/api/v1`;
const password = process.env.DEMO_PASSWORD ?? 'DemoAbsensi2026!';

async function login(userId) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Requested-With': 'attendance-portal' },
    body: JSON.stringify({ user_id: userId, password }),
  });
  assert.equal(response.status, 200, `${userId} login HTTP ${response.status}`);
  const body = await response.json();
  assert.equal(typeof body.data.user.id, 'string');
  assert.equal('accessToken' in body.data, false);
  const header = response.headers.get('set-cookie') ?? '';
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Lax/i);
  const cookie = header.split(';', 1)[0];
  assert.ok(cookie.includes('='));
  return { cookie, user: body.data.user };
}

function headers(cookie) {
  return { Cookie: cookie, Origin: origin, 'X-Requested-With': 'attendance-portal' };
}

test('cookie login, session restore, role isolation, logout', async () => {
  const hr = await login('HR001');
  const employee = await login('EMP001');
  assert.equal(hr.user.role, 'HR');
  assert.equal(employee.user.role, 'EMPLOYEE');
  const restored = await fetch(`${base}/auth/me`, { headers: headers(employee.cookie) });
  assert.equal(restored.status, 200);
  const denied = await fetch(`${base}/employees`, { headers: headers(employee.cookie) });
  assert.equal(denied.status, 403);
  const allowed = await fetch(`${base}/employees`, { headers: headers(hr.cookie) });
  assert.equal(allowed.status, 200);
  const csrf = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: employee.cookie } });
  assert.equal(csrf.status, 403);
  const logout = await fetch(`${base}/auth/logout`, { method: 'POST', headers: headers(employee.cookie) });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie') ?? '', /expires=|max-age=0/i);
});

test('employee can fetch own attendance while HR can monitor only', async () => {
  const hr = await login('HR001');
  const employee = await login('EMP001');
  const mine = await fetch(`${base}/attendance/me`, { headers: headers(employee.cookie) });
  assert.equal(mine.status, 200);
  const report = await fetch(`${base}/attendance`, { headers: headers(hr.cookie) });
  assert.equal(report.status, 200);
  const wrongRole = await fetch(`${base}/attendance/me`, { headers: headers(hr.cookie) });
  assert.equal(wrongRole.status, 403);
});

test('authenticated reverse location lookup returns optional readable address and validates coordinates', async () => {
  const employee = await login('EMP001');
  const params = new URLSearchParams({ latitude: '-6.200000', longitude: '106.816667' });
  const response = await fetch(`${base}/attendance/location/reverse?${params}`, {
    headers: headers(employee.cookie),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(typeof body.data.address === 'string' || body.data.address === null);
  assert.equal(body.data.latitude, -6.2);
  assert.equal(body.data.longitude, 106.816667);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const invalid = await fetch(`${base}/attendance/location/reverse?latitude=999&longitude=106.8`, {
    headers: headers(employee.cookie),
  });
  assert.equal(invalid.status, 400);
  const hr = await login('HR001');
  const forbidden = await fetch(`${base}/attendance/location/reverse?${params}`, { headers: headers(hr.cookie) });
  assert.equal(forbidden.status, 403);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

if (process.env.APP_ENV !== 'test' || process.env.RUN_REACTIVATION_INTEGRATION !== 'true') {
  throw new Error('Tes reaktivasi mengubah data. Wajib APP_ENV=test dan RUN_REACTIVATION_INTEGRATION=true pada lingkungan disposable.');
}

const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
const base = process.env.API_BASE_URL ?? `${origin}/api/v1`;
const demoPassword = process.env.DEMO_PASSWORD ?? 'DemoAbsensi2026!';
const initialPassword = 'KaryawanAwal!2026';
const newPassword = 'KaryawanBaru!2026';

async function request(path, { method = 'GET', cookie = '', body } = {}) {
  const headers = { Origin: origin, 'X-Requested-With': 'attendance-portal' };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${base}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(user_id, password) {
  return request('/auth/login', { method: 'POST', body: { user_id, password } });
}

function sessionCookie(response) {
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0];
  assert.ok(cookie.includes('='), 'Cookie login harus tersedia');
  return cookie;
}

async function statusOf(employeeId, hrCookie) {
  const response = await request(`/auth/accounts/${employeeId}/status`, { cookie: hrCookie });
  assert.equal(response.status, 200);
  return (await response.json()).data.status;
}

async function waitForStatus(employeeId, hrCookie, target) {
  for (let attempt = 0; attempt < 45; attempt++) {
    if ((await statusOf(employeeId, hrCookie)) === target) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(`Status akun belum ${target}; periksa RabbitMQ dan outbox`);
}

test('HR reactivates with a mandatory new password and old sessions never recover', async () => {
  const hrLogin = await login('HR001', demoPassword);
  assert.equal(hrLogin.status, 200);
  const hrCookie = sessionCookie(hrLogin);
  const employeeNumber = `RAC${randomBytes(5).toString('hex').toUpperCase()}`;
  const created = await request('/employees', { method: 'POST', cookie: hrCookie, body: {
    employeeNumber,
    fullName: 'Karyawan Reaktivasi QA',
    email: `${employeeNumber.toLowerCase()}@example.invalid`,
    department: 'QA',
    position: 'Pengujian',
  } });
  assert.equal(created.status, 201);
  const employeeId = (await created.json()).data.id;
  assert.equal(typeof employeeId, 'string');
  try {
    await waitForStatus(employeeId, hrCookie, 'PENDING');
    assert.equal((await request(`/auth/accounts/${employeeId}/activate`, {
      method: 'POST', cookie: hrCookie, body: { password: initialPassword },
    })).status, 200);
    const employeeLogin = await login(employeeNumber, initialPassword);
    assert.equal(employeeLogin.status, 200);
    const oldCookie = sessionCookie(employeeLogin);
    assert.equal((await request('/auth/me', { cookie: oldCookie })).status, 200);

    assert.equal((await request(`/employees/${employeeId}`, { method: 'DELETE', cookie: hrCookie })).status, 200);
    assert.equal((await request('/auth/me', { cookie: oldCookie })).status, 401);
    await waitForStatus(employeeId, hrCookie, 'INACTIVE');
    assert.equal((await login(employeeNumber, initialPassword)).status, 401);

    const deniedReactivate = await request(`/employees/${employeeId}/reactivate`, { method: 'PATCH' });
    assert.equal(deniedReactivate.status, 401);
    const activeAgain = await request(`/employees/${employeeId}/reactivate`, { method: 'PATCH', cookie: hrCookie, body: {} });
    assert.equal(activeAgain.status, 200);
    assert.equal((await activeAgain.json()).data.status, 'ACTIVE');
    assert.equal((await request('/auth/me', { cookie: oldCookie })).status, 401);
    assert.equal((await login(employeeNumber, initialPassword)).status, 401);

    await waitForStatus(employeeId, hrCookie, 'PENDING');
    assert.equal((await request('/auth/me', { cookie: oldCookie })).status, 401);
    assert.equal((await login(employeeNumber, initialPassword)).status, 401);
    assert.equal((await request(`/auth/accounts/${employeeId}/activate`, {
      method: 'POST', cookie: hrCookie, body: { password: 'weak' },
    })).status, 400);
    assert.equal((await statusOf(employeeId, hrCookie)), 'PENDING');
    assert.equal((await request(`/auth/accounts/${employeeId}/activate`, {
      method: 'POST', cookie: hrCookie, body: { password: initialPassword },
    })).status, 400);
    assert.equal((await request(`/auth/accounts/${employeeId}/activate`, {
      method: 'POST', cookie: hrCookie, body: { password: newPassword },
    })).status, 200);
    assert.equal((await statusOf(employeeId, hrCookie)), 'ACTIVE');
    assert.equal((await request('/auth/me', { cookie: oldCookie })).status, 401);
    assert.equal((await login(employeeNumber, initialPassword)).status, 401);

    const newLogin = await login(employeeNumber, newPassword);
    assert.equal(newLogin.status, 200);
    assert.equal((await request('/auth/me', { cookie: sessionCookie(newLogin) })).status, 200);
    assert.equal((await request(`/employees/${employeeId}/reactivate`, {
      method: 'PATCH', cookie: hrCookie, body: {},
    })).status, 409);
  } finally {
    const existing = await request(`/employees/${employeeId}`, { cookie: hrCookie });
    if (existing.status === 200 && (await existing.json()).data.status === 'ACTIVE') {
      assert.equal((await request(`/employees/${employeeId}`, { method: 'DELETE', cookie: hrCookie })).status, 200);
    }
  }
  await waitForStatus(employeeId, hrCookie, 'INACTIVE');
});

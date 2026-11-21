import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

if (process.env.APP_ENV !== 'test' || process.env.RUN_ACTIVATION_INTEGRATION !== 'true') {
  throw new Error('Tes aktivasi mengubah data. Wajib APP_ENV=test dan RUN_ACTIVATION_INTEGRATION=true pada lingkungan disposable.');
}

const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
const base = process.env.API_BASE_URL ?? `${origin}/api/v1`;
const defaultPassword = process.env.DEMO_PASSWORD ?? 'DemoAbsensi2026!';
const activatedPassword = 'StrongDemo!2026Account';

async function request(path, { method = 'GET', cookie = '', body } = {}) {
  const headers = { Origin: origin, 'X-Requested-With': 'attendance-portal' };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${base}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function statusOf(employeeId, cookie) {
  const response = await request(`/auth/accounts/${employeeId}/status`, { cookie });
  assert.equal(response.status, 200);
  const data = await response.json();
  return data.data.status;
}

async function waitForStatus(employeeId, cookie, wanted) {
  for (let attempt = 0; attempt < 35; attempt++) {
    const status = await statusOf(employeeId, cookie);
    if (status === wanted) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(`Status akun belum ${wanted}; periksa konsumen RabbitMQ dan outbox`);
}

test('HR sets initial password and activates a new pending account exactly once', async () => {
  const hrLogin = await request('/auth/login', { method: 'POST', body: { user_id: 'HR001', password: defaultPassword } });
  assert.equal(hrLogin.status, 200);
  const cookie = (hrLogin.headers.get('set-cookie') ?? '').split(';')[0];
  assert.ok(cookie.includes('='));
  const employeeNumber = `TST${randomBytes(5).toString('hex').toUpperCase()}`;
  const created = await request('/employees', { method: 'POST', cookie, body: {
    employeeNumber,
    fullName: 'Karyawan Pengujian Aktivasi',
    email: `${employeeNumber.toLowerCase()}@example.invalid`,
    department: 'QA',
    position: 'Pengujian',
  } });
  assert.equal(created.status, 201);
  const employee = await created.json();
  const employeeId = employee.data.id;
  assert.equal(typeof employeeId, 'string');
  try {
    await waitForStatus(employeeId, cookie, 'PENDING');
    const pendingLogin = await request('/auth/login', { method: 'POST', body: { user_id: employeeNumber, password: activatedPassword } });
    assert.equal(pendingLogin.status, 401);
    const wrongActor = await request(`/auth/accounts/${employeeId}/activate`, { method: 'POST', body: { password: activatedPassword } });
    assert.equal(wrongActor.status, 401);
    const employeeLogin = await request('/auth/login', { method: 'POST', body: { user_id: 'EMP001', password: defaultPassword } });
    assert.equal(employeeLogin.status, 200);
    const employeeCookie = (employeeLogin.headers.get('set-cookie') ?? '').split(';')[0];
    const wrongRole = await request(`/auth/accounts/${employeeId}/activate`, { method: 'POST', cookie: employeeCookie, body: { password: activatedPassword } });
    assert.equal(wrongRole.status, 403);
    const weak = await request(`/auth/accounts/${employeeId}/activate`, { method: 'POST', cookie, body: { password: 'weak' } });
    assert.equal(weak.status, 400);
    assert.equal(await statusOf(employeeId, cookie), 'PENDING');
    const activated = await request(`/auth/accounts/${employeeId}/activate`, { method: 'POST', cookie, body: { password: activatedPassword } });
    assert.equal(activated.status, 200);
    assert.deepEqual((await activated.json()).data, { status: 'ACTIVE' });
    assert.equal(await statusOf(employeeId, cookie), 'ACTIVE');
    const newLogin = await request('/auth/login', { method: 'POST', body: { user_id: employeeNumber, password: activatedPassword } });
    assert.equal(newLogin.status, 200);
    const repeat = await request(`/auth/accounts/${employeeId}/activate`, { method: 'POST', cookie, body: { password: activatedPassword } });
    assert.equal(repeat.status, 409);
  } finally {
    const deleted = await request(`/employees/${employeeId}`, { method: 'DELETE', cookie });
    assert.equal(deleted.status, 200);
  }
  await waitForStatus(employeeId, cookie, 'INACTIVE');
  const inactiveLogin = await request('/auth/login', { method: 'POST', body: { user_id: employeeNumber, password: activatedPassword } });
  assert.equal(inactiveLogin.status, 401);
});

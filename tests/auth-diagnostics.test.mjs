import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((done) => server.close(done));
  }
}

function runDiagnostic(url, overrides = {}) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['scripts/diagnose-auth.mjs'], {
      cwd: root,
      env: {
        ...process.env,
        APP_ORIGIN: url,
        API_BASE_URL: `${url}/api/v1`,
        AUTH_INTERNAL_URL: url,
        DEMO_USER_ID: 'EMP001',
        DEMO_PASSWORD: 'demo-password',
        INTERNAL_SERVICE_KEY: 'super-secret-test-key',
        ...overrides,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (value) => { stdout += value; });
    child.stderr.setEncoding('utf8').on('data', (value) => { stderr += value; });
    child.on('error', fail);
    child.on('close', (code) => done({ code, stdout, stderr }));
  });
}

function fakeAuthServer(internalStatus, calls) {
  return async (request, response) => {
    calls.push(`${request.method} ${request.url}`);
    if (request.method === 'POST' && request.url === '/api/v1/auth/login') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'access_token=TOP_SECRET_COOKIE; HttpOnly; Path=/' });
      response.end(JSON.stringify({ data: { user: { id: 'u1', employeeId: 'e1', userId: 'EMP001', role: 'EMPLOYEE' } } }));
      return;
    }
    if (request.method === 'GET' && request.url === '/api/v1/auth/me') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"data":{"user":{"id":"u1"}}}');
      return;
    }
    if (request.method === 'POST' && request.url === '/internal/auth/verify') {
      response.writeHead(internalStatus, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(internalStatus === 200 ? { data: { user: { id: 'u1', employeeId: 'e1', userId: 'EMP001', role: 'EMPLOYEE' } } } : { statusCode: internalStatus, message: 'DO_NOT_LOG_SECRET' }));
      return;
    }
    if (request.method === 'GET' && request.url === '/api/v1/attendance/me') {
      response.writeHead(internalStatus === 200 ? 200 : 503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(internalStatus === 200 ? { data: { items: [] } } : { message: 'Validasi akun tidak tersedia' }));
      return;
    }
    response.writeHead(404).end();
  };
}

test('diagnostic identifies 403 from Auth internal verify, without logging credentials', async () => {
  const calls = [];
  await withServer(fakeAuthServer(403, calls), async (url) => {
    const result = await runDiagnostic(url);
    assert.equal(result.code, 2);
    assert.equal(result.stderr, '');
    const output = JSON.parse(result.stdout);
    assert.equal(output.login, 200);
    assert.equal(output.session, 200);
    assert.equal(output.internalVerify, 403);
    assert.equal(output.attendance, 503);
    assert.equal(output.cause, 'AUTH_INTERNAL_FORBIDDEN');
    assert.ok(calls.includes('POST /internal/auth/verify'));
    assert.doesNotMatch(JSON.stringify(output), /TOP_SECRET_COOKIE|super-secret-test-key|demo-password|DO_NOT_LOG_SECRET/);
  });
});

test('diagnostic identifies missing internal route (404)', async () => {
  await withServer(fakeAuthServer(404, []), async (url) => {
    const result = await runDiagnostic(url);
    assert.equal(result.code, 2);
    const output = JSON.parse(result.stdout);
    assert.equal(output.internalVerify, 404);
    assert.equal(output.cause, 'AUTH_INTERNAL_NOT_FOUND');
  });
});

test('diagnostic reports success when Auth validation and attendance both return 200', async () => {
  await withServer(fakeAuthServer(200, []), async (url) => {
    const result = await runDiagnostic(url);
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.deepEqual([output.login, output.session, output.internalVerify, output.attendance], [200, 200, 200, 200]);
    assert.equal(output.cause, 'OK');
  });
});

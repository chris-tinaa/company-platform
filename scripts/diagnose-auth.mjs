import { existsSync, readFileSync } from "node:fs";

function envFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

const rootEnv = envFile(".env");
const attendanceEnv = envFile("apps/attendance-service/.env");
const authEnv = envFile("apps/auth-service/.env");
const setting = (name, ...sources) =>
  process.env[name] || sources.map((source) => source[name]).find(Boolean);
const origin =
  setting("APP_ORIGIN", rootEnv, attendanceEnv) ?? "http://localhost:5173";
const base = setting("API_BASE_URL", rootEnv) ?? `${origin}/api/v1`;
const internalUrl =
  setting("AUTH_INTERNAL_URL", attendanceEnv) ?? "http://127.0.0.1:3001";
const demoUser = setting("DEMO_USER_ID", rootEnv) ?? "EMP001";
const password = setting("DEMO_PASSWORD", rootEnv) ?? "DemoAbsensi2026!";
const keyFile = ".secrets/internal-service-key";
const serviceKey =
  process.env.INTERNAL_SERVICE_KEY ||
  (existsSync(keyFile)
    ? readFileSync(keyFile, "utf8").trim()
    : attendanceEnv.INTERNAL_SERVICE_KEY);

const result = {
  login: null,
  session: null,
  internalVerify: null,
  attendance: null,
  cause: "NOT_CHECKED",
};

function isLoopback(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      ["http:", "https:"].includes(url.protocol)
    );
  } catch {
    return false;
  }
}

async function request(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
}

async function main() {
  if (!isLoopback(base) || !isLoopback(internalUrl)) {
    result.cause = "LOCAL_ONLY";
    return;
  }
  if (
    process.env.INTERNAL_SERVICE_KEY === undefined &&
    authEnv.INTERNAL_SERVICE_KEY &&
    serviceKey &&
    authEnv.INTERNAL_SERVICE_KEY !== serviceKey
  ) {
    result.cause = "INTERNAL_SERVICE_KEY_MISMATCH";
    return;
  }
  let login;
  try {
    login = await request(`${base.replace(/\/$/, "")}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-Requested-With": "attendance-portal",
      },
      body: JSON.stringify({ user_id: demoUser, password }),
    });
  } catch {
    result.cause = "LOGIN_CONNECTION_FAILED";
    return;
  }
  result.login = login.status;
  if (login.status !== 200) {
    result.cause = "LOGIN_FAILED";
    return;
  }
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0];
  if (!cookie.includes("=")) {
    result.cause = "LOGIN_COOKIE_MISSING";
    return;
  }
  try {
    const me = await request(`${base.replace(/\/$/, "")}/auth/me`, {
      headers: { Cookie: cookie },
    });
    result.session = me.status;
    if (me.status !== 200) {
      result.cause =
        me.status === 401 ? "LOGIN_COOKIE_NOT_ACCEPTED" : "AUTH_ME_FAILED";
      return;
    }
    if (!serviceKey) {
      result.cause = "INTERNAL_SERVICE_KEY_MISSING";
      return;
    }
    const verified = await request(
      `${internalUrl.replace(/\/$/, "")}/internal/auth/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": serviceKey,
        },
        body: JSON.stringify({ cookie }),
      },
    );
    result.internalVerify = verified.status;
    const attendance = await request(
      `${base.replace(/\/$/, "")}/attendance/me`,
      { headers: { Cookie: cookie } },
    );
    result.attendance = attendance.status;
    const causes = {
      400: "AUTH_INTERNAL_BAD_REQUEST",
      401: "AUTH_INTERNAL_UNAUTHORIZED",
      403: "AUTH_INTERNAL_FORBIDDEN",
      404: "AUTH_INTERNAL_NOT_FOUND",
    };
    if (verified.status !== 200) {
      result.cause =
        causes[verified.status] ??
        (verified.status >= 500
          ? "AUTH_INTERNAL_SERVER_ERROR"
          : "AUTH_INTERNAL_FAILED");
      return;
    }
    if (attendance.status !== 200) {
      result.cause = "ATTENDANCE_ENDPOINT_FAILED";
      return;
    }
    result.cause = "OK";
  } catch {
    result.cause = "INTERNAL_OR_ATTENDANCE_CONNECTION_FAILED";
  }
}

await main();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.cause !== "OK") process.exitCode = 2;

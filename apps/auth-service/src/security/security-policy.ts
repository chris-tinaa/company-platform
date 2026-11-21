export type CookiePolicy = {
  name: "__Host-access_token" | "access_token";
  options: {
    path: "/";
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    maxAge: 900000;
  };
};

export function cookiePolicy(
  environment: string,
  appOrigin: string,
): CookiePolicy {
  const parsed = new URL(appOrigin);
  const secure = parsed.protocol === "https:";
  const local =
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (!secure && !(environment === "local" && local)) {
    throw new Error("HTTPS wajib digunakan untuk cookie aplikasi publik");
  }
  return {
    name: secure ? "__Host-access_token" : "access_token",
    options: {
      path: "/",
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: 900000,
    },
  };
}

export function acceptsUnsafeRequest(
  origin: string | undefined,
  marker: string | undefined,
  expectedOrigin: string,
): boolean {
  return origin === expectedOrigin && marker === "attendance-portal";
}

export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name)
      return part.slice(separator + 1).trim();
  }
  return null;
}

export type EmployeeSessionState = {
  eligible: boolean;
  sessionGeneration: number | null;
};

export function isAccountReady(
  status: "ACTIVE" | "PENDING" | "INACTIVE",
  accountGeneration: number,
  employee: EmployeeSessionState,
): boolean {
  return (
    status === "ACTIVE" &&
    employee.eligible &&
    Number.isSafeInteger(accountGeneration) &&
    accountGeneration > 0 &&
    employee.sessionGeneration === accountGeneration
  );
}

export function isAccountSessionCurrent(
  status: "ACTIVE" | "PENDING" | "INACTIVE",
  accountGeneration: number,
  employee: EmployeeSessionState,
  tokenGeneration: unknown,
): boolean {
  return (
    isAccountReady(status, accountGeneration, employee) &&
    tokenGeneration === accountGeneration
  );
}

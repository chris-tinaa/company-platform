import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export type CurrentUser = {
  id: string;
  employeeId: string;
  userId: string;
  role: "HR" | "EMPLOYEE";
};

export function requireInternalKey(supplied: string | undefined): void {
  const expected = process.env.INTERNAL_SERVICE_KEY ?? "";
  const actual = supplied ?? "";
  if (
    !expected ||
    expected.length !== actual.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  ) {
    throw new UnauthorizedException("Akses internal ditolak");
  }
}

export async function requireUser(
  request: Request,
  role?: "HR" | "EMPLOYEE",
): Promise<CurrentUser> {
  const secret = process.env.INTERNAL_SERVICE_KEY;
  if (!secret)
    throw new ServiceUnavailableException(
      "Konfigurasi belum tersedia",
    );
  let response: globalThis.Response;
  try {
    response = await fetch(
      `${process.env.AUTH_INTERNAL_URL ?? "http://127.0.0.1:3001"}/internal/auth/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": secret,
        },
        body: JSON.stringify({ cookie: request.headers.cookie ?? "" }),
        signal: AbortSignal.timeout(3000),
      },
    );
  } catch {
    throw new ServiceUnavailableException("Layanan autentikasi tidak tersedia");
  }
  if (response.status === 401)
    throw new UnauthorizedException("Silakan masuk kembali");
  if (!response.ok)
    throw new ServiceUnavailableException("Validasi akun tidak tersedia");
  const data = (await response.json()) as { data?: { user?: CurrentUser } };
  const actor = data.data?.user;
  if (
    !actor ||
    typeof actor.employeeId !== "string" ||
    !["HR", "EMPLOYEE"].includes(actor.role)
  ) {
    throw new ServiceUnavailableException("Respons autentikasi tidak valid");
  }
  if (role && actor.role !== role)
    throw new ForbiddenException("Anda tidak memiliki akses");
  return actor;
}

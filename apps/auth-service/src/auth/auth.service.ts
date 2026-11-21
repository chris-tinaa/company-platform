import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jwt from 'jsonwebtoken';
import { AuthRepository } from '../database/auth.repository';
import { cookiePolicy, readCookie, isAccountSessionCurrent, isAccountReady, type EmployeeSessionState } from '../security/security-policy';
import { isStrongInitialPassword } from './activation-policy';

export type CurrentUser = {
  id: string;
  employeeId: string;
  userId: string;
  role: 'HR' | 'EMPLOYEE';
};

type Claims = jwt.JwtPayload & { employeeId?: string; userId?: string; role?: string; sessionGeneration?: unknown };

@Injectable()
export class AuthService {
  private readonly privateKey: string;
  private readonly publicKey: string;

  constructor(private readonly users: AuthRepository) {
    const privatePath = process.env.JWT_PRIVATE_KEY_PATH;
    const publicPath = process.env.JWT_PUBLIC_KEY_PATH;
    if (!privatePath || !publicPath) throw new Error('JWT key paths belum dikonfigurasi');
    this.privateKey = readFileSync(resolve(privatePath), 'utf8');
    this.publicKey = readFileSync(resolve(publicPath), 'utf8');
    cookiePolicy(process.env.APP_ENV ?? 'local', process.env.APP_ORIGIN ?? 'http://localhost:5173');
  }

  async login(username: string, password: string): Promise<{ token: string; user: CurrentUser }> {
    const row = await this.users.findByUsername(username);
    if (!row || row.status !== 'ACTIVE' || !row.password_hash || !(await compare(password, row.password_hash))) {
      throw new UnauthorizedException('User ID atau kata sandi tidak valid');
    }
    const employee = await this.getEmployeeSession(row.employee_id);
    if (!isAccountReady(row.status, Number(row.session_generation), employee)) {
      throw new UnauthorizedException('Akun belum siap atau sedang dinonaktifkan');
    }
    const user = { id: row.id, employeeId: row.employee_id, userId: row.username, role: row.role };
    const token = jwt.sign({ employeeId: user.employeeId, userId: user.userId, role: user.role, sessionGeneration: Number(row.session_generation) }, this.privateKey, {
      algorithm: 'RS256', issuer: 'company-platform', audience: 'employee-portal', subject: user.id, expiresIn: 900,
    });
    return { token, user };
  }

  async currentUser(cookieHeader: string | undefined): Promise<CurrentUser> {
    const policy = cookiePolicy(process.env.APP_ENV ?? 'local', process.env.APP_ORIGIN ?? 'http://localhost:5173');
    const token = readCookie(cookieHeader, policy.name);
    if (!token) throw new UnauthorizedException('Silakan masuk kembali');
    let claims: Claims;
    try {
      claims = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'], issuer: 'company-platform', audience: 'employee-portal',
      }) as Claims;
    } catch {
      throw new UnauthorizedException('Sesi telah berakhir');
    }
    if (!claims.sub) throw new UnauthorizedException('Sesi tidak valid');
    const row = await this.users.findById(claims.sub);
    if (!row || row.status !== 'ACTIVE' || row.role !== claims.role || row.employee_id !== claims.employeeId) {
      throw new UnauthorizedException('Akun tidak aktif atau hak akses berubah');
    }
    const employee = await this.getEmployeeSession(row.employee_id);
    if (!isAccountSessionCurrent(row.status, Number(row.session_generation), employee, claims.sessionGeneration)) {
      throw new UnauthorizedException('Sesi lama sudah tidak berlaku atau status karyawan berubah');
    }
    return { id: row.id, employeeId: row.employee_id, userId: row.username, role: row.role };
  }

  async accountStatus(employeeId: string, actor: CurrentUser): Promise<string> {
    if (actor.role !== 'HR') throw new ForbiddenException('Akses hanya untuk HR');
    return this.users.accountStatus(employeeId);
  }

  async activatePendingAccount(employeeId: string, password: string, actor: CurrentUser): Promise<void> {
    if (actor.role !== 'HR') throw new ForbiddenException('Akses hanya untuk HR');
    if (!isStrongInitialPassword(password)) {
      throw new BadRequestException('Kata sandi harus 12-72 byte, mengandung huruf besar, huruf kecil, angka, dan simbol');
    }
    const status = await this.users.accountStatus(employeeId);
    if (status === 'NOT_FOUND') throw new ConflictException('Akun belum dibuat. Tunggu proses sinkronisasi karyawan.');
    if (status !== 'PENDING') throw new ConflictException('Hanya akun PENDING yang dapat diaktivasi');
    const employee = await this.getEmployeeSession(employeeId);
    if (!employee.eligible || employee.sessionGeneration === null) {
      throw new ConflictException('Karyawan tidak aktif atau tidak ditemukan');
    }
    const previousAccount = await this.users.findByEmployeeId(employeeId);
    if (previousAccount?.password_hash && await compare(password, previousAccount.password_hash)) {
      throw new BadRequestException('Kata sandi baru harus berbeda dari kata sandi sebelumnya');
    }
    const passwordHash = await hash(password, 12);
    await this.users.activatePendingAccount(employeeId, passwordHash, actor.id, employee.sessionGeneration);
  }

  private async getEmployeeSession(employeeId: string): Promise<EmployeeSessionState> {
    const key = process.env.INTERNAL_SERVICE_KEY;
    if (!key) throw new ServiceUnavailableException('Konfigurasi layanan internal tidak tersedia');
    const base = process.env.EMPLOYEE_INTERNAL_URL ?? 'http://127.0.0.1:3002';
    let response: globalThis.Response;
    try {
      response = await fetch(`${base}/internal/employees/${encodeURIComponent(employeeId)}/eligibility`, {
        method: 'GET',
        headers: { 'X-Service-Key': key },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException('Validasi status karyawan tidak tersedia');
    }
    if (!response.ok) throw new ServiceUnavailableException('Validasi status karyawan gagal');
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ServiceUnavailableException('Respons status karyawan tidak valid');
    }
    if (!payload || typeof payload !== 'object' || !('data' in payload) || !payload.data ||
      typeof payload.data !== 'object' || !('eligible' in payload.data) ||
      typeof payload.data.eligible !== 'boolean' || !('sessionGeneration' in payload.data) ||
      !(payload.data.sessionGeneration === null ||
        (typeof payload.data.sessionGeneration === 'number' && Number.isSafeInteger(payload.data.sessionGeneration) && payload.data.sessionGeneration > 0))) {
      throw new ServiceUnavailableException('Respons status karyawan tidak valid');
    }
    return { eligible: payload.data.eligible, sessionGeneration: payload.data.sessionGeneration as number | null };
  }
}

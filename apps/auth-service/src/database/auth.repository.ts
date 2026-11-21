import { ConflictException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPool, type Pool, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import type { EmployeeLifecycleEvent } from '../lifecycle/lifecycle.consumer';
import { nextEventStatus, shouldApplyLifecycle } from '../lifecycle/lifecycle-policy';
import { canActivatePendingAccount, type LifecycleStatus } from '../auth/activation-policy';

type UserRow = RowDataPacket & {
  id: string;
  employee_id: string;
  username: string;
  password_hash: string | null;
  role: 'HR' | 'EMPLOYEE';
  status: 'ACTIVE' | 'PENDING' | 'INACTIVE';
  session_generation: number;
};

@Injectable()
export class AuthRepository implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    this.pool = createPool({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? '3306'),
      database: process.env.MYSQL_DATABASE ?? 'auth_db',
      user: process.env.MYSQL_USER ?? 'auth_app',
      password: process.env.MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: 3,
      connectTimeout: 8000,
      timezone: 'Z',
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
  }

  async findByUsername(username: string): Promise<UserRow | null> {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT id, employee_id, username, password_hash, role, status, session_generation FROM users WHERE username = ? LIMIT 1',
      [username],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT id, employee_id, username, password_hash, role, status, session_generation FROM users WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ?? null;
  }

  async findByEmployeeId(employeeId: string): Promise<UserRow | null> {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT id, employee_id, username, password_hash, role, status, session_generation FROM users WHERE employee_id = ? LIMIT 1',
      [employeeId],
    );
    return rows[0] ?? null;
  }

  async accountStatus(employeeId: string): Promise<'ACTIVE' | 'PENDING' | 'INACTIVE' | 'NOT_FOUND'> {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT status FROM users WHERE employee_id = ? LIMIT 1', [employeeId],
    );
    return rows[0]?.status ?? 'NOT_FOUND';
  }

  async activatePendingAccount(employeeId: string, passwordHash: string, actorId: string, expectedSessionGeneration: number): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [lifecycleRows] = await connection.execute<(RowDataPacket & { status: 'ACTIVE' | 'INACTIVE' })[]>(
        'SELECT status FROM employee_lifecycle_state WHERE employee_id = ? FOR UPDATE', [employeeId],
      );
      const lifecycleStatus: LifecycleStatus = lifecycleRows[0]?.status ?? null;
      const [accounts] = await connection.execute<UserRow[]>(
        'SELECT id, employee_id, username, password_hash, role, status, session_generation FROM users WHERE employee_id = ? FOR UPDATE', [employeeId],
      );
      const account = accounts[0];
      if (!account || account.role !== 'EMPLOYEE' ||
        Number(account.session_generation) !== expectedSessionGeneration ||
        !canActivatePendingAccount(account.status, lifecycleStatus)) {
        throw new ConflictException('Akun tidak PENDING atau status karyawan tidak memenuhi syarat');
      }
      const [updated] = await connection.execute<ResultSetHeader>(
        'UPDATE users SET password_hash = ?, status = ? WHERE employee_id = ? AND status = ? AND session_generation = ?',
        [passwordHash, 'ACTIVE', employeeId, 'PENDING', expectedSessionGeneration],
      );
      if (updated.affectedRows !== 1) throw new ConflictException('Akun sudah berubah, muat ulang status');
      await connection.execute(
        'INSERT INTO account_activations (id, employee_id, activated_by_user_id) VALUES (?, ?, ?)',
        [randomUUID(), employeeId, actorId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async applyLifecycleEvent(event: EmployeeLifecycleEvent): Promise<boolean> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [inserted] = await connection.execute<ResultSetHeader>(
        'INSERT IGNORE INTO processed_events (event_id) VALUES (?)', [event.id],
      );
      if (inserted.affectedRows === 0) {
        await connection.commit();
        return false;
      }
      const [current] = await connection.execute<(RowDataPacket & { last_version: number })[]>(
        'SELECT last_version FROM employee_lifecycle_state WHERE employee_id = ? FOR UPDATE',
        [event.employeeId],
      );
      if (!shouldApplyLifecycle(current[0]?.last_version ?? null, event.version)) {
        await connection.commit();
        return false;
      }
      const [existingRows] = await connection.execute<UserRow[]>(
        'SELECT id, employee_id, username, password_hash, role, status, session_generation FROM users WHERE employee_id = ? FOR UPDATE',
        [event.employeeId],
      );
      const previous = existingRows[0];
      const generation = event.sessionGeneration ?? (previous ? Number(previous.session_generation) : 1);
      if (event.type === 'employee.reactivated' && !event.sessionGeneration) {
        throw new ConflictException('Event reaktivasi tidak memiliki versi sesi');
      }
      if (event.type !== 'employee.created' && event.sessionGeneration !== undefined && previous &&
        generation <= Number(previous.session_generation)) {
        throw new ConflictException('Versi sesi pada event tidak lebih baru');
      }
      const lifecycleStatus = event.type === 'employee.deactivated' ? 'INACTIVE' : 'ACTIVE';
      await connection.execute(
        'INSERT INTO employee_lifecycle_state (employee_id, last_version, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_version = VALUES(last_version), status = VALUES(status)',
        [event.employeeId, event.version, lifecycleStatus],
      );
      const newStatus = nextEventStatus(event.type);
      await connection.execute(
        'INSERT IGNORE INTO users (id, employee_id, username, password_hash, role, status, session_generation) VALUES (?, ?, ?, NULL, ?, ?, ?)',
        [randomUUID(), event.employeeId, event.employeeNumber, 'EMPLOYEE', newStatus, generation],
      );
      const [accounts] = await connection.execute<UserRow[]>(
        'SELECT id, employee_id, username, password_hash, role, status, session_generation FROM users WHERE employee_id = ? FOR UPDATE',
        [event.employeeId],
      );
      if (!accounts[0] || accounts[0].role !== 'EMPLOYEE' || accounts[0].username !== event.employeeNumber) {
        throw new ConflictException('Identitas akun tidak sesuai dengan event karyawan');
      }
      if (event.type !== 'employee.created') {
        await connection.execute(
          'UPDATE users SET status = ?, session_generation = ? WHERE employee_id = ? AND role = ?',
          [newStatus, generation, event.employeeId, 'EMPLOYEE'],
        );
      }
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async ping(): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT 1 AS ok');
    return rows.length > 0;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

import { ConflictException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createPool, type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { canDeactivateEmployee, shouldEmitDeactivation, shouldEmitReactivation } from '../employees/employee-policy';

export type EmployeeRecord = RowDataPacket & {
  id: string;
  employee_number: string;
  full_name: string;
  email: string;
  department: string;
  position: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  session_generation: number;
  created_at: Date;
};

export type EmployeeValues = {
  employeeNumber: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
};

type OutboxRow = RowDataPacket & { id: string; event_type: string; payload_json: string | Record<string, unknown> };

@Injectable()
export class EmployeeRepository implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    this.pool = createPool({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? 'employee_app',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE ?? 'employee_db',
      connectionLimit: 3, waitForConnections: true, connectTimeout: 8000,
      timezone: 'Z',
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
  }

  async list(page: number, pageSize: number, search: string): Promise<{ items: EmployeeRecord[]; page: number; pageSize: number; total: number }> {
    const pattern = `%${search}%`;
    const [rows] = await this.pool.query<EmployeeRecord[]>(
      'SELECT id, employee_number, full_name, email, department, position, status, version, session_generation, created_at FROM employees WHERE full_name LIKE ? OR employee_number LIKE ? ORDER BY full_name, id LIMIT ? OFFSET ?',
      [pattern, pattern, pageSize, (page - 1) * pageSize],
    );
    const [count] = await this.pool.execute<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM employees WHERE full_name LIKE ? OR employee_number LIKE ?', [pattern, pattern],
    );
    return { items: rows, page, pageSize, total: count[0]?.total ?? 0 };
  }

  async findById(id: string): Promise<EmployeeRecord | null> {
    const [rows] = await this.pool.execute<EmployeeRecord[]>(
      'SELECT id, employee_number, full_name, email, department, position, status, version, session_generation, created_at FROM employees WHERE id = ? LIMIT 1', [id],
    );
    return rows[0] ?? null;
  }

  async create(values: EmployeeValues): Promise<EmployeeRecord> {
    const id = randomUUID();
    const eventId = randomUUID();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        'INSERT INTO employees (id, employee_number, full_name, email, department, position, status, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, values.employeeNumber, values.fullName, values.email, values.department, values.position, 'ACTIVE', 1],
      );
      const event = { id: eventId, type: 'employee.created', employeeId: id, employeeNumber: values.employeeNumber, version: 1, sessionGeneration: 1, occurredAt: new Date().toISOString() };
      await connection.execute('INSERT INTO outbox_events (id, event_type, payload_json) VALUES (?, ?, ?)', [eventId, event.type, JSON.stringify(event)]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (isDuplicate(error)) throw new ConflictException('Nomor atau email karyawan sudah digunakan');
      throw error;
    } finally {
      connection.release();
    }
    const record = await this.findById(id);
    if (!record) throw new NotFoundException('Karyawan gagal ditemukan setelah dibuat');
    return record;
  }

  async update(id: string, version: number, values: Partial<EmployeeValues>): Promise<EmployeeRecord> {
    const current = await this.findById(id);
    if (!current) throw new NotFoundException('Karyawan tidak ditemukan');
    if (current.status !== 'ACTIVE') throw new ConflictException('Karyawan tidak aktif');
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        'UPDATE employees SET full_name = ?, email = ?, department = ?, position = ?, version = version + 1 WHERE id = ? AND version = ? AND status = ?',
        [values.fullName ?? current.full_name, values.email ?? current.email, values.department ?? current.department,
          values.position ?? current.position, id, version, 'ACTIVE'],
      );
      if (result.affectedRows !== 1) throw new ConflictException('Data telah berubah, muat ulang sebelum menyimpan');
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictException('Email karyawan sudah digunakan');
      throw error;
    }
    const updated = await this.findById(id);
    if (!updated) throw new NotFoundException('Karyawan tidak ditemukan');
    return updated;
  }

  async deactivate(id: string): Promise<EmployeeRecord> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<EmployeeRecord[]>(
        'SELECT id, employee_number, status, version, session_generation FROM employees WHERE id = ? FOR UPDATE', [id],
      );
      const row = rows[0];
      if (!row) throw new NotFoundException('Karyawan tidak ditemukan');
      if (!canDeactivateEmployee(row.employee_number)) throw new ConflictException('Akun demo utama tidak dapat dinonaktifkan');
      if (shouldEmitDeactivation(row.status)) {
        const version = Number(row.version) + 1;
        const sessionGeneration = Number(row.session_generation) + 1;
        await connection.execute('UPDATE employees SET status = ?, version = ?, session_generation = ? WHERE id = ?', ['INACTIVE', version, sessionGeneration, id]);
        const event = { id: randomUUID(), type: 'employee.deactivated', employeeId: id, employeeNumber: row.employee_number, version, sessionGeneration, occurredAt: new Date().toISOString() };
        await connection.execute('INSERT INTO outbox_events (id, event_type, payload_json) VALUES (?, ?, ?)', [event.id, event.type, JSON.stringify(event)]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    const updated = await this.findById(id);
    if (!updated) throw new NotFoundException('Karyawan tidak ditemukan');
    return updated;
  }

  async reactivate(id: string): Promise<EmployeeRecord> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<EmployeeRecord[]>(
        'SELECT id, employee_number, status, version, session_generation FROM employees WHERE id = ? FOR UPDATE', [id],
      );
      const row = rows[0];
      if (!row) throw new NotFoundException('Karyawan tidak ditemukan');
      if (!shouldEmitReactivation(row.status)) throw new ConflictException('Hanya karyawan nonaktif yang dapat diaktifkan kembali');
      const version = Number(row.version) + 1;
      const sessionGeneration = Number(row.session_generation) + 1;
      await connection.execute(
        'UPDATE employees SET status = ?, version = ?, session_generation = ? WHERE id = ?',
        ['ACTIVE', version, sessionGeneration, id],
      );
      const event = {
        id: randomUUID(), type: 'employee.reactivated', employeeId: id,
        employeeNumber: row.employee_number, version, sessionGeneration, occurredAt: new Date().toISOString(),
      };
      await connection.execute(
        'INSERT INTO outbox_events (id, event_type, payload_json) VALUES (?, ?, ?)',
        [event.id, event.type, JSON.stringify(event)],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    const updated = await this.findById(id);
    if (!updated) throw new NotFoundException('Karyawan tidak ditemukan');
    return updated;
  }

  async names(employeeIds: string[]): Promise<Array<{ id: string; fullName: string }>> {
    if (employeeIds.length === 0) return [];
    const ids = employeeIds.slice(0, 100);
    const questionMarks = ids.map(() => '?').join(',');
    const [rows] = await this.pool.execute<(RowDataPacket & { id: string; full_name: string })[]>(
      `SELECT id, full_name FROM employees WHERE id IN (${questionMarks})`, ids,
    );
    return rows.map((row) => ({ id: row.id, fullName: row.full_name }));
  }

  async pendingEvents(): Promise<OutboxRow[]> {
    const [rows] = await this.pool.query<OutboxRow[]>(
      'SELECT id, event_type, payload_json FROM outbox_events WHERE published_at IS NULL ORDER BY created_at, id LIMIT 10',
    );
    return rows;
  }

  async markPublished(eventId: string): Promise<void> {
    await this.pool.execute('UPDATE outbox_events SET published_at = UTC_TIMESTAMP(3), attempts = attempts + 1 WHERE id = ? AND published_at IS NULL', [eventId]);
  }

  async recordFailure(eventId: string): Promise<void> {
    await this.pool.execute('UPDATE outbox_events SET attempts = attempts + 1 WHERE id = ?', [eventId]);
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}

import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createPool, type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { canDeactivateEmployee, shouldEmitDeactivation, shouldEmitReactivation } from '../employees/employee-policy';
import { canAssignMaster, isMasterCode, isPositionLevel } from '../masters/master-policy';

export type EmployeeRecord = RowDataPacket & {
  id: string;
  employee_number: string;
  full_name: string;
  email: string;
  department_id: string;
  position_id: string;
  department: string;
  position: string;
  position_level: number;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  session_generation: number;
  created_at: Date;
};

export type EmployeeValues = {
  employeeNumber: string;
  fullName: string;
  email: string;
  departmentId: string;
  positionId: string;
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
      'SELECT e.id, e.employee_number, e.full_name, e.email, e.department_id, e.position_id, d.name AS department, p.name AS position, p.`level` AS position_level, e.status, e.version, e.session_generation, e.created_at FROM employees e JOIN departments d ON d.id = e.department_id JOIN positions p ON p.id = e.position_id WHERE e.full_name LIKE ? OR e.employee_number LIKE ? ORDER BY e.full_name, e.id LIMIT ? OFFSET ?',
      [pattern, pattern, pageSize, (page - 1) * pageSize],
    );
    const [count] = await this.pool.execute<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM employees WHERE full_name LIKE ? OR employee_number LIKE ?', [pattern, pattern],
    );
    return { items: rows, page, pageSize, total: count[0]?.total ?? 0 };
  }

  async findById(id: string): Promise<EmployeeRecord | null> {
    const [rows] = await this.pool.execute<EmployeeRecord[]>(
      'SELECT e.id, e.employee_number, e.full_name, e.email, e.department_id, e.position_id, d.name AS department, p.name AS position, p.`level` AS position_level, e.status, e.version, e.session_generation, e.created_at FROM employees e JOIN departments d ON d.id = e.department_id JOIN positions p ON p.id = e.position_id WHERE e.id = ? LIMIT 1', [id],
    );
    return rows[0] ?? null;
  }

  async create(values: EmployeeValues): Promise<EmployeeRecord> {
    await this.assertAssignable(values.departmentId, values.positionId);
    const id = randomUUID();
    const eventId = randomUUID();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        'INSERT INTO employees (id, employee_number, full_name, email, department_id, position_id, status, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, values.employeeNumber, values.fullName, values.email, values.departmentId, values.positionId, 'ACTIVE', 1],
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
    const departmentId = values.departmentId ?? current.department_id;
    const positionId = values.positionId ?? current.position_id;
    if ((values.departmentId !== undefined && values.departmentId !== current.department_id) ||
        (values.positionId !== undefined && values.positionId !== current.position_id)) {
      await this.assertAssignable(departmentId, positionId);
    }
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        'UPDATE employees SET full_name = ?, email = ?, department_id = ?, position_id = ?, version = version + 1 WHERE id = ? AND version = ? AND status = ?',
        [values.fullName ?? current.full_name, values.email ?? current.email, departmentId,
          positionId, id, version, 'ACTIVE'],
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

  async assertAssignable(departmentId: string, positionId: string): Promise<void> {
    const [rows] = await this.pool.execute<(RowDataPacket & { department_ok: number; position_ok: number })[]>(
      'SELECT (SELECT COUNT(*) FROM departments WHERE id = ? AND is_active = 1) AS department_ok, (SELECT COUNT(*) FROM positions WHERE id = ? AND is_active = 1) AS position_ok',
      [departmentId, positionId],
    );
    if (!canAssignMaster(Number(rows[0]?.department_ok) === 1, Number(rows[0]?.position_ok) === 1)) {
      throw new BadRequestException('Departemen atau jabatan tidak ditemukan atau sudah nonaktif');
    }
  }

  async listDepartments(): Promise<Array<RowDataPacket & { id: string; code: string; name: string; is_active: number }>> {
    const [rows] = await this.pool.query<(RowDataPacket & { id: string; code: string; name: string; is_active: number })[]>(
      'SELECT id, code, name, is_active FROM departments ORDER BY name, id',
    );
    return rows;
  }

  async createDepartment(code: string, name: string) {
    if (!isMasterCode(code)) throw new BadRequestException('Kode departemen tidak valid');
    const id = randomUUID();
    try {
      await this.pool.execute('INSERT INTO departments (id, code, name) VALUES (?, ?, ?)', [id, code, name]);
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictException('Kode atau nama departemen sudah digunakan');
      throw error;
    }
    return { id, code, name, is_active: 1 };
  }

  async updateDepartment(id: string, values: { code?: string; name?: string; isActive?: boolean }) {
    if (values.code !== undefined && !isMasterCode(values.code)) throw new BadRequestException('Kode departemen tidak valid');
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        'UPDATE departments SET code = COALESCE(?, code), name = COALESCE(?, name), is_active = COALESCE(?, is_active) WHERE id = ?',
        [values.code ?? null, values.name ?? null, values.isActive === undefined ? null : Number(values.isActive), id],
      );
      if (!result.affectedRows) throw new NotFoundException('Departemen tidak ditemukan');
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictException('Kode atau nama departemen sudah digunakan');
      throw error;
    }
    const [rows] = await this.pool.execute<(RowDataPacket & { id: string; code: string; name: string; is_active: number })[]>(
      'SELECT id, code, name, is_active FROM departments WHERE id = ?', [id],
    );
    return rows[0];
  }

  async listPositions(): Promise<Array<RowDataPacket & { id: string; code: string; name: string; level: number; is_active: number }>> {
    const [rows] = await this.pool.query<(RowDataPacket & { id: string; code: string; name: string; level: number; is_active: number })[]>(
      'SELECT id, code, name, `level` AS level, is_active FROM positions ORDER BY `level`, name, id',
    );
    return rows;
  }

  async createPosition(code: string, name: string, level: number) {
    if (!isMasterCode(code) || !isPositionLevel(level)) throw new BadRequestException('Kode atau level jabatan tidak valid');
    const id = randomUUID();
    try {
      await this.pool.execute('INSERT INTO positions (id, code, name, `level`) VALUES (?, ?, ?, ?)', [id, code, name, level]);
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictException('Kode atau nama jabatan sudah digunakan');
      throw error;
    }
    return { id, code, name, level, is_active: 1 };
  }

  async updatePosition(id: string, values: { code?: string; name?: string; level?: number; isActive?: boolean }) {
    if ((values.code !== undefined && !isMasterCode(values.code)) ||
        (values.level !== undefined && !isPositionLevel(values.level))) {
      throw new BadRequestException('Kode atau level jabatan tidak valid');
    }
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        'UPDATE positions SET code = COALESCE(?, code), name = COALESCE(?, name), `level` = COALESCE(?, `level`), is_active = COALESCE(?, is_active) WHERE id = ?',
        [values.code ?? null, values.name ?? null, values.level ?? null,
          values.isActive === undefined ? null : Number(values.isActive), id],
      );
      if (!result.affectedRows) throw new NotFoundException('Jabatan tidak ditemukan');
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictException('Kode atau nama jabatan sudah digunakan');
      throw error;
    }
    const [rows] = await this.pool.execute<(RowDataPacket & { id: string; code: string; name: string; level: number; is_active: number })[]>(
      'SELECT id, code, name, `level` AS level, is_active FROM positions WHERE id = ?', [id],
    );
    return rows[0];
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

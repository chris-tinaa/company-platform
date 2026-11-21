import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';

export type AttendanceRow = RowDataPacket & {
  id: string;
  employee_id: string;
  attendance_date: string;
  checked_in_at: Date;
  latitude: number;
  longitude: number;
  location_accuracy: number;
  location_address: string | null;
  document_id: string;
  idempotency_key: string;
  request_hash: string;
};

type InsertAttendance = {
  id: string;
  employeeId: string;
  date: string;
  timestamp: Date;
  latitude: string;
  longitude: string;
  accuracy: string;
  locationAddress: string | null;
  documentId: string;
  idempotencyKey: string;
  requestHash: string;
};

const columns = 'id, employee_id, DATE_FORMAT(attendance_date, "%Y-%m-%d") AS attendance_date, checked_in_at, latitude, longitude, location_accuracy, location_address, document_id, idempotency_key, request_hash';

@Injectable()
export class AttendanceRepository implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    this.pool = createPool({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? 'attendance_app',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE ?? 'attendance_db',
      connectionLimit: 3, waitForConnections: true, connectTimeout: 8000,
      timezone: 'Z',
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
  }

  async byKey(employeeId: string, idempotencyKey: string): Promise<AttendanceRow | null> {
    const [rows] = await this.pool.execute<AttendanceRow[]>(
      `SELECT ${columns} FROM attendance WHERE employee_id = ? AND idempotency_key = ? LIMIT 1`,
      [employeeId, idempotencyKey],
    );
    return rows[0] ?? null;
  }

  async byDay(employeeId: string, date: string): Promise<AttendanceRow | null> {
    const [rows] = await this.pool.execute<AttendanceRow[]>(
      `SELECT ${columns} FROM attendance WHERE employee_id = ? AND attendance_date = ? LIMIT 1`,
      [employeeId, date],
    );
    return rows[0] ?? null;
  }

  async insert(values: InsertAttendance): Promise<void> {
    await this.pool.execute(
      'INSERT INTO attendance (id, employee_id, attendance_date, checked_in_at, latitude, longitude, location_accuracy, location_address, document_id, idempotency_key, request_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [values.id, values.employeeId, values.date, values.timestamp, values.latitude,
      values.longitude, values.accuracy, values.locationAddress, values.documentId, values.idempotencyKey, values.requestHash],
    );
  }

  async list(employeeId: string | null, page: number, pageSize: number, from: string | null, to: string | null) {
    const filters: string[] = [];
    const params: Array<string | number> = [];
    if (employeeId) { filters.push('employee_id = ?'); params.push(employeeId); }
    if (from) { filters.push('attendance_date >= ?'); params.push(from); }
    if (to) { filters.push('attendance_date <= ?'); params.push(to); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [rows] = await this.pool.query<AttendanceRow[]>(
      `SELECT ${columns} FROM attendance ${where} ORDER BY checked_in_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const [counts] = await this.pool.execute<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM attendance ${where}`, params,
    );
    return { items: rows, page, pageSize, total: counts[0]?.total ?? 0 };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

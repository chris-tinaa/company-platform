import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createConnection, type RowDataPacket } from 'mysql2/promise';

test('attendance database persists and returns readable location address with a rolled-back fixture', async () => {
  const connection = await createConnection({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'attendance_app',
    password: process.env.MYSQL_PASSWORD ?? process.env.MYSQL_ATTENDANCE_PASSWORD ?? 'local_attendance_only',
    database: process.env.MYSQL_DATABASE ?? 'attendance_db',
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
  try {
    await connection.beginTransaction();
    const id = randomUUID();
    const address = 'Jalan Jenderal Sudirman, Jakarta Selatan, DKI Jakarta, Indonesia';
    await connection.execute(
      'INSERT INTO attendance (id, employee_id, attendance_date, checked_in_at, latitude, longitude, location_accuracy, location_address, document_id, idempotency_key, request_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, randomUUID(), '2026-01-01', new Date('2026-01-01T02:00:00Z'), -6.2, 106.816667, 12, address, randomUUID(), randomUUID(), 'a'.repeat(64)],
    );
    const [rows] = await connection.execute<(RowDataPacket & { location_address: string | null })[]>(
      'SELECT location_address FROM attendance WHERE id = ?', [id],
    );
    assert.equal(rows[0]?.location_address, address);
  } finally {
    await connection.rollback();
    await connection.end();
  }
});

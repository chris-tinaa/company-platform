import { ConflictException, Injectable, OnModuleDestroy } from "@nestjs/common";
import {
  createPool,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

export type DocumentRow = RowDataPacket & {
  id: string;
  subject_employee_id: string;
  uploader_employee_id: string;
  storage_id: string;
  sha256: string;
  content_type: string;
  size_bytes: number;
  status: "STAGED" | "READY";
  attendance_id: string | null;
};

@Injectable()
export class DocumentRepository implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    this.pool = createPool({
      host: process.env.MYSQL_HOST ?? "127.0.0.1",
      port: Number(process.env.MYSQL_PORT ?? "3306"),
      user: process.env.MYSQL_USER ?? "document_app",
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE ?? "document_db",
      connectionLimit: 3,
      waitForConnections: true,
      connectTimeout: 8000,
      timezone: "Z",
      ssl:
        process.env.MYSQL_SSL === "true"
          ? { rejectUnauthorized: true }
          : undefined,
    });
  }

  async create(input: {
    id: string;
    employeeId: string;
    uploaderId: string;
    storageId: string;
    sha256: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<void> {
    await this.pool.execute(
      "INSERT INTO documents (id, subject_employee_id, uploader_employee_id, storage_id, sha256, content_type, size_bytes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        input.id,
        input.employeeId,
        input.uploaderId,
        input.storageId,
        input.sha256,
        input.contentType,
        input.sizeBytes,
        "STAGED",
      ],
    );
  }

  async find(id: string): Promise<DocumentRow | null> {
    const [rows] = await this.pool.execute<DocumentRow[]>(
      "SELECT id, subject_employee_id, uploader_employee_id, storage_id, sha256, content_type, size_bytes, status, attendance_id FROM documents WHERE id = ? LIMIT 1",
      [id],
    );
    return rows[0] ?? null;
  }

  async finalize(id: string, attendanceId: string): Promise<void> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE documents SET status = ?, attendance_id = ? WHERE id = ? AND (attendance_id IS NULL OR attendance_id = ?)",
      ["READY", attendanceId, id, attendanceId],
    );
    if (result.affectedRows !== 1)
      throw new ConflictException(
        "Dokumen sudah digunakan atau tidak ditemukan",
      );
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

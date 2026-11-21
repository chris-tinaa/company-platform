import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { DocumentRepository } from "../database/document.repository";
import { StorageService } from "../storage/storage.service";
import type { CurrentUser } from "../security/current-user";

function validatedType(file: Uint8Array): "image/jpeg" | "image/png" {
  if (file.length >= 3 && file[0] === 255 && file[1] === 216 && file[2] === 255)
    return "image/jpeg";
  if (
    file.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => file[index] === byte,
    )
  )
    return "image/png";
  throw new BadRequestException("Format isi foto harus JPG atau PNG");
}

@Injectable()
export class DocumentService {
  constructor(
    private readonly repo: DocumentRepository,
    private readonly storage: StorageService,
  ) { }

  async stage(
    file: Express.Multer.File | undefined,
    employeeId: string,
    uploaderId: string,
  ) {
    if (!file || !file.buffer || file.size < 1 || file.size > 5_242_880) {
      throw new BadRequestException("Foto wajib diisi dan maksimal 5 MB");
    }
    if (
      !/^[0-9a-f-]{36}$/i.test(employeeId) ||
      !/^[0-9a-f-]{36}$/i.test(uploaderId)
    ) {
      throw new BadRequestException("Identitas karyawan tidak valid");
    }
    const mime = validatedType(file.buffer);
    const id = randomUUID();
    const digest = createHash("sha256").update(file.buffer).digest("hex");
    await this.storage.upload(id, file.buffer, mime);
    await this.repo.create({
      id,
      employeeId,
      uploaderId,
      storageId: id,
      sha256: digest,
      contentType: mime,
      sizeBytes: file.size,
    });
    return { documentId: id, sha256: digest };
  }

  async finalize(documentId: string, attendanceId: string): Promise<void> {
    await this.repo.finalize(documentId, attendanceId);
  }

  async content(
    documentId: string,
    actor: CurrentUser,
  ): Promise<{ bytes: Buffer; mime: string }> {
    const doc = await this.repo.find(documentId);
    if (!doc || doc.status !== "READY")
      throw new NotFoundException("Dokumen tidak ditemukan");
    if (actor.role !== "HR" && doc.subject_employee_id !== actor.employeeId) {
      throw new ForbiddenException("Anda tidak memiliki akses ke dokumen");
    }
    return {
      bytes: await this.storage.get(doc.storage_id),
      mime: doc.content_type,
    };
  }
}

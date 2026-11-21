import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CurrentUser } from '../security/current-user';
import { AttendanceRepository, type AttendanceRow } from './attendance.repository';
import { detectPhotoType, jakartaDate, normalizeAccuracy, normalizeCoordinate, requestHash } from './attendance-policy';
import { csvDocument } from './csv-policy';
import { ReverseGeocoder } from '../location/reverse-geocoder';

export type CheckInPayload = { latitude?: string; longitude?: string; locationAccuracy?: string };

@Injectable()
export class AttendanceService {
  constructor(
    private readonly attendance: AttendanceRepository,
    private readonly geocoder: ReverseGeocoder,
  ) { }

  private async internalRequest<T>(service: 'employees' | 'documents', url: string, options: RequestInit = {}): Promise<T> {
    const base = service === 'employees'
      ? (process.env.EMPLOYEE_INTERNAL_URL ?? 'http://127.0.0.1:3002')
      : (process.env.DOCUMENT_INTERNAL_URL ?? 'http://127.0.0.1:3004');
    const secret = process.env.INTERNAL_SERVICE_KEY;
    if (!secret) throw new ServiceUnavailableException('Konfigurasi internal belum tersedia');
    let response: Response;
    try {
      response = await fetch(base + url, {
        ...options,
        headers: { ...(options.headers as Record<string, string> | undefined), 'X-Service-Key': secret },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ServiceUnavailableException('Layanan pendukung tidak tersedia');
    }
    if (!response.ok) throw new ServiceUnavailableException('Layanan pendukung menolak permintaan');
    return response.json() as Promise<T>;
  }

  private async assertEligible(employeeId: string): Promise<void> {
    const result = await this.internalRequest<{ data: { eligible: boolean } }>('employees', `/internal/employees/${employeeId}/eligibility`);
    if (!result.data.eligible) throw new ForbiddenException('Karyawan tidak aktif atau tidak terdaftar');
  }

  private async finalizeDocument(documentId: string, attendanceId: string): Promise<void> {
    await this.internalRequest('documents', `/internal/documents/${documentId}/finalize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceId }),
    });
  }

  private response(row: AttendanceRow) {
    return {
      id: row.id,
      employeeId: row.employee_id,
      attendanceDate: row.attendance_date,
      checkedInAt: row.checked_in_at instanceof Date ? row.checked_in_at.toISOString() : row.checked_in_at,
      latitude: Number(row.latitude), longitude: Number(row.longitude),
      locationAccuracy: Number(row.location_accuracy), locationAddress: row.location_address, documentId: row.document_id,
    };
  }

  async reverseLocation(user: CurrentUser, latitudeInput?: string, longitudeInput?: string) {
    if (user.role !== 'EMPLOYEE') throw new ForbiddenException('Hanya karyawan yang dapat mengambil alamat lokasi');
    let latitude: number;
    let longitude: number;
    try {
      latitude = Number(normalizeCoordinate(latitudeInput ?? '', 'latitude'));
      longitude = Number(normalizeCoordinate(longitudeInput ?? '', 'longitude'));
    } catch {
      throw new BadRequestException('Koordinat lokasi tidak valid');
    }
    const address = await this.geocoder.reverse(latitude, longitude);
    return { address, latitude, longitude, provider: address ? 'OpenStreetMap Nominatim' : null };
  }

  async checkIn(user: CurrentUser, idempotencyKey: string | undefined, payload: CheckInPayload, file: Express.Multer.File | undefined) {
    if (user.role !== 'EMPLOYEE') throw new ForbiddenException('Hanya karyawan yang dapat absen');
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key tidak valid');
    }
    if (!file || file.size < 1 || file.size > 5_242_880) throw new BadRequestException('Foto wajib diisi dan maksimal 5 MB');
    const mime = detectPhotoType(file.buffer);
    const latitude = normalizeCoordinate(payload.latitude ?? '', 'latitude');
    const longitude = normalizeCoordinate(payload.longitude ?? '', 'longitude');
    const accuracy = normalizeAccuracy(payload.locationAccuracy ?? '');
    const hash = requestHash(user.employeeId, latitude, longitude, accuracy, file.buffer);
    const existing = await this.attendance.byKey(user.employeeId, idempotencyKey);
    if (existing) {
      if (existing.request_hash !== hash) throw new ConflictException('Request sudah dipakai untuk data berbeda');
      await this.finalizeDocument(existing.document_id, existing.id);
      return this.response(existing);
    }
    await this.assertEligible(user.employeeId);
    const now = new Date();
    const date = jakartaDate(now);
    const today = await this.attendance.byDay(user.employeeId, date);
    if (today) throw new ConflictException('Anda sudah melakukan absensi hari ini');
    const locationAddress = await this.geocoder.reverse(Number(latitude), Number(longitude));
    const form = new FormData();
    form.set('photo', new Blob([file.buffer], { type: mime }), mime === 'image/png' ? 'bukti.png' : 'bukti.jpg');
    form.set('employeeId', user.employeeId);
    form.set('uploaderId', user.employeeId);
    const staged = await this.internalRequest<{ data: { documentId: string } }>('documents', '/internal/documents/stage', {
      method: 'POST', body: form,
    });
    const id = randomUUID();
    try {
      await this.attendance.insert({
        id, employeeId: user.employeeId, date, timestamp: now,
        latitude, longitude, accuracy, locationAddress, documentId: staged.data.documentId,
        idempotencyKey, requestHash: hash,
      });
    } catch (error) {
      const committed = await this.attendance.byKey(user.employeeId, idempotencyKey).catch(() => null);
      if (committed) {
        if (committed.request_hash !== hash) throw new ConflictException('Request digunakan untuk data berbeda');
        await this.finalizeDocument(committed.document_id, committed.id);
        return this.response(committed);
      }
      if (isDuplicate(error)) throw new ConflictException('Anda sudah melakukan absensi hari ini');
      throw new ServiceUnavailableException('Status penyimpanan absensi belum dapat dipastikan, coba ulang dengan key yang sama');
    }
    await this.finalizeDocument(staged.data.documentId, id);
    const saved = await this.attendance.byKey(user.employeeId, idempotencyKey);
    if (!saved) throw new ServiceUnavailableException('Absensi tersimpan namun belum dapat dibaca, silakan periksa riwayat');
    return this.response(saved);
  }

  private validateList(pageText: string, sizeText: string, from?: string, to?: string) {
    const page = Number(pageText);
    const size = Number(sizeText);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 1000 ||
      (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
      throw new BadRequestException('Filter absensi tidak valid');
    }
    return { page, size, from: from ?? null, to: to ?? null };
  }

  async mine(user: CurrentUser, page = '1', pageSize = '20', from?: string, to?: string) {
    if (user.role !== 'EMPLOYEE') throw new ForbiddenException('Hanya karyawan yang dapat melihat riwayat pribadi');
    const filter = this.validateList(page, pageSize, from, to);
    if (filter.size > 50) throw new BadRequestException('Maksimal 50 data per halaman');
    const records = await this.attendance.list(user.employeeId, filter.page, filter.size, filter.from, filter.to);
    return { ...records, items: records.items.map((row) => this.response(row)) };
  }

  async hrList(user: CurrentUser, page = '1', pageSize = '20', from?: string, to?: string, exportAll = false) {
    if (user.role !== 'HR') throw new ForbiddenException('Hanya HR yang dapat memantau absensi');
    const filter = this.validateList(page, pageSize, from, to);
    if (!exportAll && filter.size > 50) throw new BadRequestException('Maksimal 50 data per halaman');
    const records = await this.attendance.list(null, filter.page, filter.size, filter.from, filter.to);
    const ids = [...new Set(records.items.map((row) => row.employee_id))];
    const mapping = await this.internalRequest<{ data: { items: Array<{ id: string; fullName: string }> } }>(
      'employees', '/internal/employees/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeIds: ids }),
    },
    );
    const names = new Map(mapping.data.items.map((item) => [item.id, item.fullName]));
    return { ...records, items: records.items.map((row) => ({ ...this.response(row), fullName: names.get(row.employee_id) ?? '-' })) };
  }

  async export(user: CurrentUser, scope: 'HR' | 'EMPLOYEE', from?: string, to?: string): Promise<string> {
    const records = scope === 'HR'
      ? await this.hrList(user, '1', '1000', from, to, true)
      : await this.attendance.list(user.employeeId, 1, 1000, from ?? null, to ?? null);
    const rows: unknown[][] = [['Tanggal', 'Waktu (UTC)', 'ID Karyawan', 'Nama', 'Latitude', 'Longitude', 'Alamat Perkiraan', 'ID Bukti Foto']];
    for (const row of records.items) {
      const fullName = 'fullName' in row ? String(row.fullName) : '';
      const record = 'attendanceDate' in row ? row : this.response(row);
      rows.push([record.attendanceDate, record.checkedInAt, record.employeeId, fullName, record.latitude, record.longitude, record.locationAddress, record.documentId]);
    }
    return csvDocument(rows);
  }
}

function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}

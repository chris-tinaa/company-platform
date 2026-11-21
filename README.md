# Dokumentasi Teknis
> **📘 [Arsitektur dan Design](https://docs.google.com/document/d/1lRj4CdVHBjXFvckcGJ9TpQ_D7KdfeC_XoNJMvu1LfuE/edit?usp=sharing)** 
Klik link di atas untuk mengunjungi

# Platform Perusahaan — Absensi WFH

Monorepo pnpm dengan NestJS microservices dan satu frontend (React + Vite).

## Struktur

| Bagian | Lokasi | Port |
| --- | --- | --- |
| Auth | `apps/auth-service` | 3001 |
| Karyawan & master data | `apps/employee-service` | 3002 |
| Absensi | `apps/attendance-service` | 3003 |
| Dokumen / foto | `apps/document-service` | 3004 |
| Frontend | `apps/employee-portal` | 5173 |
| Kontrak bersama | `packages/contracts` | — |
| Infrastruktur (MySQL, RabbitMQ) | `infrastructure/` | — |

Setiap service backend adalah aplikasi NestJS independen dengan manifest `package.json` sendiri. 

Frontend terletak di `apps/employee-portal` dan di-build dengan Vite.

## Run in Localhost

Requirements: Node.js 22, pnpm, dan Docker Desktop.

```bash
pnpm install        # install dependensi
pnpm setup:local    # buat JWT secret key + file .env lokal
pnpm dev:infra      # jalankan MySQL & RabbitMQ via Docker Compose
pnpm db:migrate     # apply migrasi ke empat database
pnpm db:seed        # isi akun demo (HR001 dan EMP001)
pnpm dev            # jalankan semua layanan & frontend secara paralel
```

Buka `http://localhost:5173` setelah `pnpm dev` berjalan.

### Testing

```bash
pnpm test:unit      # pengujian unit & kebijakan
pnpm test:smoke     # pengujian smoke API
pnpm check          # lint + typecheck + test:unit + build
```

## Fitur

### Auth — `apps/auth-service`
- Login/logout dengan cookie JWT `HttpOnly`.
- Proteksi CSRF untuk permintaan yang mengubah data.
- Verifikasi key internal antar-service (`/internal/auth/verify`).
- Manage status akun (aktivasi karyawan).
- Consume lifecycle event karyawan via RabbitMQ.

### Karyawan — `apps/employee-service`
- CRUD karyawan.
- Master data departemen dan jabatan.
- Cek eligibilitas karyawan untuk absensi.
- Endpoint internal batch untuk layanan lain.

### Absensi — `apps/attendance-service`
- Check-in WFH.
- Riwayat absensi pribadi.
- Ekspor CSV (pribadi dan HR).
- Reverse geocode lokasi check-in.

### Dokumen — `apps/document-service`
- Staging dan finalisasi dokumen/foto.
- Pengambilan foto dokumen.
- Driver penyimpanan lokal atau Appwrite.

### Frontend — `apps/employee-portal`
- Login mode demo (HR dan Karyawan).
- Check-in dengan kompresi foto sebelum upload.
- Riwayat absensi.
- Direktori karyawan (HR).
- Laporan monitoring (HR).
- Tampilan responsif untuk HP

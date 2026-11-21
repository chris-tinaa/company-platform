import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

@Injectable()
export class StorageService {
  private readonly driver = process.env.STORAGE_DRIVER ?? "local";

  private path(id: string): string {
    return resolve(process.env.LOCAL_STORAGE_DIR ?? ".local-storage", id);
  }

  private appwriteConfig(): {
    endpoint: string;
    project: string;
    key: string;
    bucket: string;
  } {
    const endpoint = process.env.APPWRITE_ENDPOINT ?? "";
    const project = process.env.APPWRITE_PROJECT_ID ?? "";
    const key = process.env.APPWRITE_API_KEY ?? "";
    const bucket = process.env.APPWRITE_BUCKET_ID ?? "";
    if (
      !endpoint ||
      !project ||
      !key ||
      !bucket ||
      !endpoint.startsWith("https://")
    ) {
      throw new ServiceUnavailableException(
        "Penyimpanan Appwrite belum dikonfigurasi",
      );
    }
    return { endpoint: endpoint.replace(/\/$/, ""), project, key, bucket };
  }

  async upload(id: string, bytes: Uint8Array, mime: string): Promise<void> {
    if (this.driver === "local") {
      if (
        (process.env.APP_ENV ?? "local") !== "local" &&
        process.env.APP_ENV !== "test"
      ) {
        throw new ServiceUnavailableException(
          "Penyimpanan lokal tidak diizinkan pada demo publik",
        );
      }
      await mkdir(resolve(process.env.LOCAL_STORAGE_DIR ?? ".local-storage"), {
        recursive: true,
      });
      await writeFile(this.path(id), bytes);
      return;
    }
    if (this.driver !== "appwrite")
      throw new ServiceUnavailableException("Jenis penyimpanan tidak didukung");
    const config = this.appwriteConfig();
    const form = new FormData();
    form.set("fileId", id);
    form.set(
      "file",
      new Blob([Buffer.from(bytes)], { type: mime }),
      id + (mime === "image/png" ? ".png" : ".jpg"),
    );
    const response = await fetch(
      `${config.endpoint}/storage/buckets/${encodeURIComponent(config.bucket)}/files`,
      {
        method: "POST",
        headers: {
          "X-Appwrite-Project": config.project,
          "X-Appwrite-Key": config.key,
        },
        body: form,
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new ServiceUnavailableException("Upload foto ke penyimpanan gagal");
  }

  async get(id: string): Promise<Buffer> {
    if (this.driver === "local") return readFile(this.path(id));
    const config = this.appwriteConfig();
    const response = await fetch(
      `${config.endpoint}/storage/buckets/${encodeURIComponent(config.bucket)}/files/${encodeURIComponent(id)}/download`,
      {
        headers: {
          "X-Appwrite-Project": config.project,
          "X-Appwrite-Key": config.key,
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw new ServiceUnavailableException("Foto tidak dapat diambil");
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(id: string): Promise<void> {
    if (this.driver === "local") {
      await unlink(this.path(id)).catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        )
          throw error;
      });
      return;
    }
    const config = this.appwriteConfig();
    const response = await fetch(
      `${config.endpoint}/storage/buckets/${encodeURIComponent(config.bucket)}/files/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: {
          "X-Appwrite-Project": config.project,
          "X-Appwrite-Key": config.key,
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok && response.status !== 404)
      throw new ServiceUnavailableException("Foto tidak dapat dihapus");
  }
}

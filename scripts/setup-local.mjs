import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const services = ["auth", "employee", "attendance", "document"];

async function copyExample(source, target) {
  if (!existsSync(target)) await copyFile(source, target);
}

await mkdir(".secrets", { recursive: true });
const privateKeyPath = ".secrets/jwt-private.pem";
const publicKeyPath = ".secrets/jwt-public.pem";
const privateExists = existsSync(privateKeyPath);
const publicExists = existsSync(publicKeyPath);
if (privateExists !== publicExists)
  throw new Error(
    "Pasangan kunci JWT tidak lengkap; periksa .secrets tanpa menghapus kunci yang ada",
  );
if (!privateExists) {
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  await writeFile(privateKeyPath, pair.privateKey, { mode: 0o600, flag: "wx" });
  await writeFile(publicKeyPath, pair.publicKey, { mode: 0o644, flag: "wx" });
}

const secretPath = ".secrets/internal-service-key";
if (!existsSync(secretPath)) {
  await writeFile(secretPath, randomBytes(32).toString("hex"), {
    mode: 0o600,
    flag: "wx",
  });
}
const secret = (await readFile(secretPath, "utf8")).trim();
if (!/^[a-f0-9]{64}$/.test(secret))
  throw new Error("Format kunci layanan internal tidak valid");

await copyExample(".env.example", ".env");
await copyExample(
  "apps/employee-portal/.env.example",
  "apps/employee-portal/.env",
);
for (const service of services) {
  const base = `apps/${service}-service`;
  const target = `${base}/.env`;
  await copyExample(`${base}/.env.example`, target);
  const original = await readFile(target, "utf8");
  const line = /^INTERNAL_SERVICE_KEY=(.*)$/m;
  const match = original.match(line);
  if (!match)
    throw new Error(`INTERNAL_SERVICE_KEY tidak ditemukan: ${target}`);
  if (
    match[1] !== "replace-with-generated-internal-key" &&
    match[1] !== secret
  ) {
    throw new Error(`Kunci layanan internal berbeda: ${target}`);
  }
  if (match[1] !== secret)
    await writeFile(
      target,
      original.replace(line, `INTERNAL_SERVICE_KEY=${secret}`),
      { mode: 0o600 },
    );
}
process.stdout.write(
  "Konfigurasi lokal siap: file .env dan kunci tersimpan secara lokal tanpa menimpa konfigurasi lama.\n",
);

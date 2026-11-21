import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir(".secrets", { recursive: true });
const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
await writeFile(".secrets/jwt-private.pem", keys.privateKey, {
  mode: 0o600,
  flag: "wx",
});
await writeFile(".secrets/jwt-public.pem", keys.publicKey, {
  mode: 0o644,
  flag: "wx",
});
process.stdout.write(
  `Kunci JWT tersimpan di .secrets/\nKunci layanan internal (salin ke semua .env service): ${randomBytes(32).toString("hex")}\n`,
);

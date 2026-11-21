import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createConnection } from "mysql2/promise";

const services = [
  ["auth-service", "auth_db"],
  ["employee-service", "employee_db"],
  ["attendance-service", "attendance_db"],
  ["document-service", "document_db"],
];

const base = {
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_MIGRATION_USER ?? "root",
  password:
    process.env.MYSQL_MIGRATION_PASSWORD ?? process.env.MYSQL_ROOT_PASSWORD,
  multipleStatements: true,
  ssl:
    process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: true } : undefined,
};

for (const [service, database] of services) {
  const connection = await createConnection({ ...base, database });
  try {
    await connection.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(200) PRIMARY KEY, sha256 CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))",
    );
    const files = (await readdir(`apps/${service}/migrations`))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of files) {
      const sql = await readFile(`apps/${service}/migrations/${name}`, "utf8");
      const digest = createHash("sha256").update(sql).digest("hex");
      const [rows] = await connection.execute(
        "SELECT sha256 FROM schema_migrations WHERE name = ?",
        [name],
      );
      if (Array.isArray(rows) && rows.length > 0) {
        if (rows[0].sha256 !== digest)
          throw new Error(
            `Migrasi berubah setelah diterapkan: ${service}/${name}`,
          );
        continue;
      }
      await connection.query(sql);
      await connection.execute(
        "INSERT INTO schema_migrations (name, sha256) VALUES (?, ?)",
        [name, digest],
      );
      process.stdout.write(`Migrasi berhasil: ${database}/${name}\n`);
    }
  } finally {
    await connection.end();
  }
}

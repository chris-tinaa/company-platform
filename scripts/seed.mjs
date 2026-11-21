import "dotenv/config";
import { hash } from "bcryptjs";
import { createConnection } from "mysql2/promise";

if (
  process.env.DEMO_MODE !== "true" ||
  !["local", "demo", "test"].includes(process.env.APP_ENV ?? "")
) {
  throw new Error(
    "Seed akun demo hanya diizinkan pada DEMO_MODE dan APP_ENV local/demo/test",
  );
}

const host = process.env.MYSQL_HOST ?? "127.0.0.1";
const port = Number(process.env.MYSQL_PORT ?? 3306);
const connectionOptions = {
  host,
  port,
  user: process.env.MYSQL_MIGRATION_USER ?? "root",
  password:
    process.env.MYSQL_MIGRATION_PASSWORD ?? process.env.MYSQL_ROOT_PASSWORD,
  ssl:
    process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: true } : undefined,
};

const people = [
  {
    employeeId: "00000000-0000-4000-8000-000000000101",
    userId: "00000000-0000-4000-8000-000000000201",
    number: "HR001",
    name: "Demo Admin HR",
    email: "hr001@example.invalid",
    department: "Human Resources",
    position: "Administrator HR",
    role: "HR",
  },
  {
    employeeId: "00000000-0000-4000-8000-000000000102",
    userId: "00000000-0000-4000-8000-000000000202",
    number: "EMP001",
    name: "Demo Karyawan",
    email: "emp001@example.invalid",
    department: "Teknologi Informasi",
    position: "Staf",
    role: "EMPLOYEE",
  },
];

const password = await hash(
  process.env.DEMO_PASSWORD ?? "DemoAbsensi2026!",
  12,
);
const employee = await createConnection({
  ...connectionOptions,
  database: "employee_db",
});
const auth = await createConnection({
  ...connectionOptions,
  database: "auth_db",
});
try {
  for (const person of people) {
    await employee.execute(
      "INSERT IGNORE INTO employees (id, employee_number, full_name, email, department, position, status, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        person.employeeId,
        person.number,
        person.name,
        person.email,
        person.department,
        person.position,
        "ACTIVE",
        1,
      ],
    );
    await auth.execute(
      "INSERT IGNORE INTO users (id, employee_id, username, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)",
      [
        person.userId,
        person.employeeId,
        person.number,
        password,
        person.role,
        "ACTIVE",
      ],
    );
    await auth.execute(
      "INSERT IGNORE INTO employee_lifecycle_state (employee_id, last_version, status) VALUES (?, ?, ?)",
      [person.employeeId, 1, "ACTIVE"],
    );
  }
  process.stdout.write(
    "Data dummy HR001 dan EMP001 tersedia; data lama tidak diaktifkan kembali.\n",
  );
} finally {
  await employee.end();
  await auth.end();
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(".");

function temporaryWorkspace() {
  const directory = mkdtempSync(join(tmpdir(), "attendance-setup-"));
  mkdirSync(join(directory, "scripts"), { recursive: true });
  copyFileSync(
    join(root, "scripts/setup-local.mjs"),
    join(directory, "scripts/setup-local.mjs"),
  );
  copyFileSync(join(root, ".env.example"), join(directory, ".env.example"));
  for (const name of ["auth", "employee", "attendance", "document"]) {
    const base = join(directory, "apps", `${name}-service`);
    mkdirSync(base, { recursive: true });
    copyFileSync(
      join(root, "apps", `${name}-service`, ".env.example"),
      join(base, ".env.example"),
    );
  }
  mkdirSync(join(directory, "apps/employee-portal"), { recursive: true });
  copyFileSync(
    join(root, "apps/employee-portal/.env.example"),
    join(directory, "apps/employee-portal/.env.example"),
  );
  return directory;
}

function execute(directory) {
  return spawnSync(process.execPath, ["scripts/setup-local.mjs"], {
    cwd: directory,
    encoding: "utf8",
  });
}

test("local setup creates matching internal secrets and valid RSA keys", () => {
  const directory = temporaryWorkspace();
  const result = execute(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(directory, ".secrets/jwt-private.pem")));
  assert.match(
    readFileSync(join(directory, ".secrets/jwt-public.pem"), "utf8"),
    /BEGIN PUBLIC KEY/,
  );
  const keys = ["auth", "employee", "attendance", "document"].map((name) => {
    const env = readFileSync(
      join(directory, "apps", `${name}-service`, ".env"),
      "utf8",
    );
    return env.match(/^INTERNAL_SERVICE_KEY=([a-f0-9]{64})$/m)?.[1];
  });
  assert.ok(keys[0]);
  assert.deepEqual(new Set(keys).size, 1);
  assert.equal(existsSync(join(directory, ".env")), true);
  assert.match(
    readFileSync(join(directory, "apps/employee-portal/.env"), "utf8"),
    /VITE_DEMO_MODE=true/,
  );
});

test("rerunning local setup does not rotate keys or overwrite edited configs", () => {
  const directory = temporaryWorkspace();
  assert.equal(execute(directory).status, 0);
  const first = readFileSync(
    join(directory, ".secrets/jwt-private.pem"),
    "utf8",
  );
  const file = join(directory, "apps/auth-service/.env");
  writeFileSync(
    file,
    readFileSync(file, "utf8") + "\nUSER_SETTING=preserved\n",
  );
  const result = execute(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(join(directory, ".secrets/jwt-private.pem"), "utf8"),
    first,
  );
  assert.match(readFileSync(file, "utf8"), /USER_SETTING=preserved/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

test("backend services use pinned NestJS and have no ORM", () => {
  for (const name of ["auth", "employee", "attendance", "document"]) {
    const packageJson = readJson(`apps/${name}-service/package.json`);
    assert.equal(packageJson.dependencies["@nestjs/core"], "11.2.11");
    assert.equal(packageJson.dependencies["@nestjs/common"], "11.2.11");
    for (const orm of ["prisma", "typeorm", "sequelize"])
      assert.equal(packageJson.dependencies[orm], undefined);
  }
});

test("root release is initialized and future scripts are not fake successes", () => {
  const root = readJson("package.json");
  assert.equal(root.version, "0.1.0");
  assert.match(root.scripts["test:integration"], /api-smoke/);
  assert.doesNotMatch(
    root.scripts["test:integration"],
    /--if-present|echo\s+pass/,
  );
});

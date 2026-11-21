import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

for (const app of [
  "employee-portal",
  "auth-service",
  "employee-service",
  "attendance-service",
  "document-service",
]) {
  test(`${app} has its own package manifest`, () => {
    const path = `apps/${app}/package.json`;
    assert.ok(existsSync(path));
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(manifest.name, `@company/${app}`);
  });
}
test("workspace does not depend on ORM or Nx", () => {
  for (const app of [
    "employee-portal",
    "auth-service",
    "employee-service",
    "attendance-service",
    "document-service",
  ]) {
    const manifest = JSON.parse(
      readFileSync(`apps/${app}/package.json`, "utf8"),
    );
    assert.equal(
      JSON.stringify(manifest).match(/typeorm|prisma|sequelize|nx/gi),
      null,
    );
  }
});

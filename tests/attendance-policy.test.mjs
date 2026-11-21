import test from "node:test";
import assert from "node:assert/strict";
import {
  jakartaDate,
  normalizeCoordinate,
  requestHash,
  detectPhotoType,
} from "../apps/attendance-service/src/attendance/attendance-policy.ts";

test("Jakarta date uses server UTC instant across midnight", () => {
  assert.equal(jakartaDate(new Date("2026-11-21T17:30:00.000Z")), "2026-11-22");
  assert.equal(jakartaDate(new Date("2026-11-21T16:59:59.000Z")), "2026-11-21");
});

test("coordinates are bounded and normalized", () => {
  assert.equal(normalizeCoordinate("-6.2000000", "latitude"), "-6.200000");
  assert.equal(normalizeCoordinate("106.8166667", "longitude"), "106.816667");
  assert.throws(() => normalizeCoordinate("100", "latitude"), /lokasi/i);
  assert.throws(() => normalizeCoordinate("abc", "longitude"), /lokasi/i);
});

test("idempotency hashes normalized values and actual compressed photo bytes", () => {
  const first = requestHash(
    "employee-1",
    "-6.2",
    "106.8",
    "12.0",
    Buffer.from("image-a"),
  );
  const same = requestHash(
    "employee-1",
    "-6.2000000",
    "106.8000",
    "12",
    Buffer.from("image-a"),
  );
  const changed = requestHash(
    "employee-1",
    "-6.2",
    "106.8",
    "12",
    Buffer.from("image-b"),
  );
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test("photo type is detected from content not filename", () => {
  assert.equal(
    detectPhotoType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])),
    "image/jpeg",
  );
  assert.equal(
    detectPhotoType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
  assert.throws(() => detectPhotoType(Buffer.from("not an image")), /foto/i);
});

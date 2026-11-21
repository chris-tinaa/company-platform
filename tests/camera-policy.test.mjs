import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canCaptureFrame, isFreshLocation } from '../apps/employee-portal/src/shared/media/camera-policy.mjs';

const now = 200_000;
const currentLocation = { latitude: -6.2, longitude: 106.8, accuracy: 15, acquiredAt: now - 1_000 };

test('location must exist before a live camera frame can be captured', () => {
  assert.equal(canCaptureFrame(null, true, now), false);
  assert.equal(canCaptureFrame(undefined, true, now), false);
  assert.equal(canCaptureFrame(currentLocation, false, now), false);
  assert.equal(canCaptureFrame(currentLocation, true, now), true);
});

test('location expires after two minutes', () => {
  assert.equal(isFreshLocation({ ...currentLocation, acquiredAt: now - 120_000 }, now), true);
  assert.equal(isFreshLocation({ ...currentLocation, acquiredAt: now - 120_001 }, now), false);
  assert.equal(canCaptureFrame({ ...currentLocation, acquiredAt: now - 120_001 }, true, now), false);
});

test('invalid coordinates and accuracy cannot authorize camera capture', () => {
  assert.equal(isFreshLocation({ ...currentLocation, latitude: 91 }, now), false);
  assert.equal(isFreshLocation({ ...currentLocation, longitude: -181 }, now), false);
  assert.equal(isFreshLocation({ ...currentLocation, accuracy: -1 }, now), false);
  assert.equal(isFreshLocation({ ...currentLocation, acquiredAt: now + 1_000 }, now), false);
  assert.equal(isFreshLocation({ ...currentLocation, latitude: Number.NaN }, now), false);
});

test('attendance screen has no file picker and requires live getUserMedia', () => {
  const page = readFileSync('apps/employee-portal/src/modules/attendance/CheckInPage.tsx', 'utf8');
  assert.doesNotMatch(page, /type=["']file["']/i);
  assert.doesNotMatch(page, /capture=["']user["']/i);
  assert.doesNotMatch(page, /Pilih atau ambil foto|Foto belum dipilih/i);
  assert.match(page, /getUserMedia/);
  assert.match(page, /getCurrentPosition/);
  assert.match(page, /playsInline/);
  assert.match(page, /canCaptureFrame/);
  assert.match(page, /compressPhoto/);
});

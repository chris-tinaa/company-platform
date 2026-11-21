import test from "node:test";
import assert from "node:assert/strict";
import { fitDimensions } from "../apps/employee-portal/src/shared/media/image-dimensions.mjs";

test("portrait mobile image scales to 1280 on longest side", () => {
  assert.deepEqual(fitDimensions(3024, 4032), { width: 960, height: 1280 });
});
test("small images are not enlarged", () => {
  assert.deepEqual(fitDimensions(400, 300), { width: 400, height: 300 });
});
test("invalid images fail", () => {
  assert.throws(() => fitDimensions(0, 100));
});

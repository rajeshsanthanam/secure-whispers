import { describe, it as test } from "node:test";
import { strict as assert } from "node:assert";
import { clampPhotoTransform, PHOTO_IDENTITY, wheelPhotoScale, zoomPhotoAt } from "./photo-zoom";

const bounds = { width: 400, height: 300, imageWidth: 400, imageHeight: 300 };
describe("photo zoom gesture rules", () => {
  test("scale is limited to 1–5 and 1x has no pan", () => {
    assert.deepEqual(clampPhotoTransform({ scale: 0.5, x: 90, y: -80 }, bounds), PHOTO_IDENTITY);
    assert.equal(clampPhotoTransform({ scale: 9, x: 0, y: 0 }, bounds).scale, 5);
  });
  test("pan cannot reveal space beyond the scaled image edges", () => {
    assert.deepEqual(clampPhotoTransform({ scale: 2, x: 999, y: -999 }, bounds), { scale: 2, x: 200, y: -150 });
    assert.deepEqual(clampPhotoTransform({ scale: 2, x: 99, y: 99 }, { ...bounds, imageWidth: 100, imageHeight: 100 }), { scale: 2, x: 0, y: 0 });
  });
  test("2.5x double-tap keeps the tapped image point stationary", () => {
    assert.deepEqual(zoomPhotoAt(PHOTO_IDENTITY, 2.5, { x: 60, y: -40 }, bounds), { scale: 2.5, x: -90, y: 60 });
  });
  test("wheel zoom uses magnitude and normalizes line and page deltas", () => {
    assert.equal(wheelPhotoScale(2, 1, 1), wheelPhotoScale(2, 16, 0));
    assert.equal(wheelPhotoScale(2, 1, 2), wheelPhotoScale(2, 100, 0));
    assert.ok(wheelPhotoScale(2, -1, 0) < wheelPhotoScale(2, -100, 0));
    assert.equal(wheelPhotoScale(2, -10000, 0), 5);
  });
});
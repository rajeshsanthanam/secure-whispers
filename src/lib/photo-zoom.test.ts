import { describe, expect, test } from "bun:test";
import { clampPhotoTransform, PHOTO_IDENTITY, wheelPhotoScale, zoomPhotoAt } from "./photo-zoom";

const bounds = { width: 400, height: 300, imageWidth: 400, imageHeight: 300 };
describe("photo zoom gesture rules", () => {
  test("scale is limited to 1–5 and 1x has no pan", () => {
    expect(clampPhotoTransform({ scale: 0.5, x: 90, y: -80 }, bounds)).toEqual(PHOTO_IDENTITY);
    expect(clampPhotoTransform({ scale: 9, x: 0, y: 0 }, bounds).scale).toBe(5);
  });
  test("pan cannot reveal space beyond the scaled image edges", () => {
    expect(clampPhotoTransform({ scale: 2, x: 999, y: -999 }, bounds)).toEqual({ scale: 2, x: 200, y: -150 });
    expect(clampPhotoTransform({ scale: 2, x: 99, y: 99 }, { ...bounds, imageWidth: 100, imageHeight: 100 })).toEqual({ scale: 2, x: 0, y: 0 });
  });
  test("2.5x double-tap keeps the tapped image point stationary", () => {
    expect(zoomPhotoAt(PHOTO_IDENTITY, 2.5, { x: 60, y: -40 }, bounds)).toEqual({ scale: 2.5, x: -90, y: 60 });
  });
  test("wheel zoom uses magnitude and normalizes line and page deltas", () => {
    expect(wheelPhotoScale(2, 1, 1)).toBe(wheelPhotoScale(2, 16, 0));
    expect(wheelPhotoScale(2, 1, 2)).toBe(wheelPhotoScale(2, 100, 0));
    expect(wheelPhotoScale(2, -1, 0)).toBeLessThan(wheelPhotoScale(2, -100, 0));
    expect(wheelPhotoScale(2, -10000, 0)).toBe(5);
  });
});
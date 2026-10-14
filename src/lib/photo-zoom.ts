export type PhotoTransform = { scale: number; x: number; y: number };
export type PhotoBounds = { width: number; height: number; imageWidth: number; imageHeight: number };
export const PHOTO_IDENTITY: PhotoTransform = { scale: 1, x: 0, y: 0 };

export function clampPhotoTransform(value: PhotoTransform, bounds: PhotoBounds): PhotoTransform {
  const scale = Math.min(5, Math.max(1, value.scale));
  const maxX = Math.max(0, (bounds.imageWidth * scale - bounds.width) / 2);
  const maxY = Math.max(0, (bounds.imageHeight * scale - bounds.height) / 2);
  return { scale, x: scale === 1 ? 0 : Math.min(maxX, Math.max(-maxX, value.x)), y: scale === 1 ? 0 : Math.min(maxY, Math.max(-maxY, value.y)) };
}

// Points are relative to the viewport center; the image's transform origin is its center.
export function zoomPhotoAt(value: PhotoTransform, scale: number, point: { x: number; y: number }, bounds: PhotoBounds): PhotoTransform {
  const nextScale = Math.min(5, Math.max(1, scale));
  const ratio = nextScale / value.scale;
  return clampPhotoTransform({ scale: nextScale, x: point.x - (point.x - value.x) * ratio, y: point.y - (point.y - value.y) * ratio }, bounds);
}

export function wheelPhotoScale(scale: number, delta: number, mode: number): number {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? 100 : 1);
  return Math.min(5, Math.max(1, scale * Math.exp(-pixels * 0.0015)));
}
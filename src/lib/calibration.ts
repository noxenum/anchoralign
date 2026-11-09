// Pixel scale of T1 and T2. Each image has its own scale along x and y, taken
// from its metadata, from the other image's metadata, entered manually or the
// default. Alignment works in T1's frame with square pixels: T1 is resampled
// when its pixels are not square and T2 is rescaled to T1's scale.

import { DEFAULT_PX_PER_MM } from './geometry';
import { dpiToPxPerMm, pxPerMmToDpi, type ImageResolution } from './imageResolution';
import type { Affine6, ImageKey, ImageSize } from '@/types';

export type CalibrationUnit = 'pxmm' | 'dpi';

// px/mm along x and y.
export type PixelScale = { x: number; y: number };

export type CalibrationSource =
  | { kind: 'default' }
  | { kind: 'manual' }
  // Metadata of an image that has since been replaced by one without.
  | { kind: 'kept' }
  // `image` is the image whose metadata is used, not necessarily this one.
  | { kind: 'metadata'; image: ImageKey; resolution: ImageResolution };

export type ImageCalibration = { scale: PixelScale; source: CalibrationSource };
export type Calibration = Record<ImageKey, ImageCalibration>;
export type ImageResolutions = Partial<Record<ImageKey, ImageResolution | null>>;

export const IMAGE_KEYS = ['t1', 't2'] as const;

// Exporters round the two rationals differently (205.98 vs 206), so values this
// close count as equal.
const TOLERANCE = 0.005;

const otherImage = (image: ImageKey): ImageKey => (image === 't1' ? 't2' : 't1');

export function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
}

export function isSquare(scale: PixelScale): boolean {
  return sameValue(scale.x, scale.y);
}

export function sameScale(a: PixelScale, b: PixelScale): boolean {
  return sameValue(a.x, b.x) && sameValue(a.y, b.y);
}

export function squareScale(pxPerMm: number): PixelScale {
  return { x: pxPerMm, y: pxPerMm };
}

export function initialCalibration(): Calibration {
  return {
    t1: { scale: squareScale(DEFAULT_PX_PER_MM), source: { kind: 'default' } },
    t2: { scale: squareScale(DEFAULT_PX_PER_MM), source: { kind: 'default' } },
  };
}

function usable(resolution: ImageResolution | null | undefined): resolution is ImageResolution {
  return !!resolution && !resolution.placeholder;
}

// Scale stated by the metadata. Pixels within rounding of square count as square.
export function metadataScale(resolution: ImageResolution): PixelScale {
  const x = dpiToPxPerMm(resolution.dpiX);
  const y = dpiToPxPerMm(resolution.dpiY);
  return sameValue(x, y) ? squareScale(x) : { x, y };
}

// Calibration after an image (re)load: each image takes its own metadata, else
// the other image's. A manually entered value is never overridden.
export function nextCalibration(current: Calibration, resolutions: ImageResolutions): Calibration {
  const next = { ...current };
  for (const image of IMAGE_KEYS) {
    const own = current[image];
    if (own.source.kind === 'manual') continue;
    const from = usable(resolutions[image]) ? image : usable(resolutions[otherImage(image)]) ? otherImage(image) : null;
    if (from) {
      const resolution = resolutions[from] as ImageResolution;
      next[image] = { scale: metadataScale(resolution), source: { kind: 'metadata', image: from, resolution } };
    } else if (own.source.kind === 'metadata') {
      next[image] = { scale: own.scale, source: { kind: 'kept' } };
    }
  }
  return next;
}

// Drops manual values and applies the metadata again.
export function resetCalibration(resolutions: ImageResolutions): Calibration {
  return nextCalibration(initialCalibration(), resolutions);
}

export function withManualScale(current: Calibration, images: readonly ImageKey[], scale: Partial<PixelScale>): Calibration {
  const next = { ...current };
  for (const image of images) next[image] = { scale: { ...current[image].scale, ...scale }, source: { kind: 'manual' } };
  return next;
}

// ---------- Alignment frame ----------

// px/mm of the alignment frame: T1 with square pixels at its finer resolution,
// so that resampling T1 never discards detail. All mm values refer to it.
export function workingPxPerMm(calibration: Calibration): number {
  return Math.max(calibration.t1.scale.x, calibration.t1.scale.y);
}

// Maps an image's native pixels into the alignment frame's scale; null when
// the image already has that scale.
export function toWorkingScale(calibration: Calibration, image: ImageKey): Affine6 | null {
  const target = workingPxPerMm(calibration);
  const { x, y } = calibration[image].scale;
  const sx = target / x;
  const sy = target / y;
  return Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9 ? null : [sx, 0, 0, 0, sy, 0];
}

// Size of an image after `matrix`, a scale from toWorkingScale.
export function scaledSize(size: ImageSize, matrix: Affine6 | null): ImageSize {
  if (!matrix) return size;
  return { width: Math.round(size.width * matrix[0]), height: Math.round(size.height * matrix[4]) };
}

// ---------- Formatting ----------

export function sourceLabel(source: CalibrationSource): string {
  switch (source.kind) {
    case 'metadata': return `${source.resolution.tag} ${source.image.toUpperCase()}`;
    case 'manual': return 'manual';
    case 'kept': return 'kept';
    default: return 'default';
  }
}

export function fromPxPerMm(value: number, unit: CalibrationUnit): number {
  return unit === 'dpi' ? pxPerMmToDpi(value) : value;
}

export function toPxPerMm(value: number, unit: CalibrationUnit): number {
  return unit === 'dpi' ? dpiToPxPerMm(value) : value;
}

export const UNIT_LABELS: Record<CalibrationUnit, string> = { pxmm: 'px/mm', dpi: 'dpi' };

function formatNumber(pxPerMm: number, unit: CalibrationUnit): string {
  return unit === 'dpi' ? pxPerMmToDpi(pxPerMm).toFixed(1) : pxPerMm.toFixed(2);
}

// "8.11" or "8.11 × 7.95" for non-square pixels, without the unit.
export function formatScaleValue(scale: PixelScale, unit: CalibrationUnit): string {
  return isSquare(scale) ? formatNumber(scale.x, unit) : `${formatNumber(scale.x, unit)} × ${formatNumber(scale.y, unit)}`;
}

export function formatScale(scale: PixelScale, unit: CalibrationUnit): string {
  return `${formatScaleValue(scale, unit)} ${UNIT_LABELS[unit]}`;
}

// Whether one square value describes both images.
export function isUniform(calibration: Calibration): boolean {
  return isSquare(calibration.t1.scale) && sameScale(calibration.t1.scale, calibration.t2.scale);
}

// ---------- Warnings ----------

function formatDpi(pxPerMm: number): string {
  return `${Number(pxPerMmToDpi(pxPerMm).toFixed(1))}`;
}

function formatDpiScale(scale: PixelScale): string {
  return isSquare(scale) ? `${formatDpi(scale.x)} dpi` : `${formatDpi(scale.x)} × ${formatDpi(scale.y)} dpi`;
}

export function calibrationWarnings(calibration: Calibration, resolutions: ImageResolutions, loaded: Record<ImageKey, boolean>): string[] {
  const warnings: string[] = [];
  const working = workingPxPerMm(calibration);
  for (const image of IMAGE_KEYS) {
    const name = image.toUpperCase();
    const { scale } = calibration[image];
    const resolution = resolutions[image];
    if (resolution?.placeholder) {
      warnings.push(`${name} metadata ${formatDpi(dpiToPxPerMm(resolution.dpiX))} dpi ignored (common placeholder value).`);
    } else if (resolution && !sameScale(metadataScale(resolution), scale)) {
      warnings.push(`${name} metadata says ${formatDpiScale(metadataScale(resolution))}, not the ${formatDpiScale(scale)} in use.`);
    }
    if (!loaded[image]) continue;
    if (!isSquare(scale)) {
      warnings.push(image === 't1'
        ? `T1 has non-square pixels (${formatDpiScale(scale)}); it is resampled to square pixels at ${formatDpi(working)} dpi for alignment, display and export.`
        : `T2 has non-square pixels (${formatDpiScale(scale)}); it is resampled to T1's scale.`);
    }
  }
  if (loaded.t1 && loaded.t2 && !sameScale(calibration.t1.scale, calibration.t2.scale)) {
    warnings.push(`T1 (${formatDpiScale(calibration.t1.scale)}) and T2 (${formatDpiScale(calibration.t2.scale)}) are calibrated differently; T2 is rescaled to T1's scale. Check that both values are right.`);
  }
  const fallback = (kind: 'default' | 'kept') => IMAGE_KEYS.filter((image) => loaded[image] && calibration[image].source.kind === kind)
    .map((image) => image.toUpperCase()).join(' and ');
  const defaults = fallback('default');
  if (defaults) warnings.push(`No resolution in the metadata of ${defaults}; using the default ${DEFAULT_PX_PER_MM.toFixed(2)} px/mm.`);
  const kept = fallback('kept');
  if (kept) warnings.push(`${kept}: value kept from a previously loaded image; the current images carry no usable resolution.`);
  return warnings;
}

import type { GrayPatch } from '@/types';

export type RoiHistoryView = 'gray' | 'edge' | 'overlay' | 'difference';

export type RenderedPatch = {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
};

export type DisplayRange = {
  min: number;
  max: number;
  gamma?: number;
};

export function grayPatchToRgba(
  patch: GrayPatch,
  range?: DisplayRange,
): RenderedPatch {
  const source = patchBytes(patch);
  const data = new Uint8ClampedArray(patch.width * patch.height * 4);
  for (let i = 0, j = 0; i < source.length; i += 1, j += 4) {
    const value = range ? mapDisplayValue(source[i], range) : source[i];
    data[j] = value;
    data[j + 1] = value;
    data[j + 2] = value;
    data[j + 3] = 255;
  }
  return { width: patch.width, height: patch.height, data };
}

export function contrastRangeForPatches(patches: GrayPatch[]): DisplayRange {
  const histogram = new Uint32Array(256);
  let total = 0;
  for (const patch of patches) {
    const bytes = patchBytes(patch);
    for (let i = 0; i < bytes.length; i += 1) histogram[bytes[i]] += 1;
    total += bytes.length;
  }
  if (!total) return { min: 0, max: 255, gamma: 0.72 };

  let min = percentileFromHistogram(histogram, total, 0.02);
  let max = percentileFromHistogram(histogram, total, 0.99);
  if (max - min < 8) {
    min = firstOccupiedBin(histogram);
    max = lastOccupiedBin(histogram);
  }
  if (max <= min) return { min: 0, max: 255, gamma: 0.72 };
  return { min, max, gamma: 0.72 };
}

export function comparisonToRgba(
  fixed: GrayPatch,
  moving: GrayPatch,
  view: 'overlay' | 'difference',
): RenderedPatch {
  if (fixed.width !== moving.width || fixed.height !== moving.height) {
    throw new Error('ROI comparison patches must have matching dimensions');
  }
  const fixedBytes = patchBytes(fixed);
  const movingBytes = patchBytes(moving);
  const data = new Uint8ClampedArray(fixed.width * fixed.height * 4);

  for (let i = 0, j = 0; i < fixedBytes.length; i += 1, j += 4) {
    const left = fixedBytes[i];
    const right = movingBytes[i];
    if (view === 'difference') {
      const difference = Math.abs(left - right);
      data[j] = difference;
      data[j + 1] = difference;
      data[j + 2] = difference;
    } else {
      data[j] = left;
      data[j + 1] = right;
      data[j + 2] = right;
    }
    data[j + 3] = 255;
  }

  return { width: fixed.width, height: fixed.height, data };
}

function mapDisplayValue(value: number, range: DisplayRange): number {
  const span = Math.max(1, range.max - range.min);
  const normalized = Math.max(0, Math.min(1, (value - range.min) / span));
  const adjusted = Math.pow(normalized, range.gamma ?? 1);
  return Math.round(adjusted * 255);
}

function percentileFromHistogram(
  histogram: Uint32Array,
  total: number,
  percentile: number,
): number {
  const target = Math.max(0, Math.min(total - 1, Math.floor((total - 1) * percentile)));
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value];
    if (seen > target) return value;
  }
  return 255;
}

function firstOccupiedBin(histogram: Uint32Array): number {
  for (let value = 0; value < histogram.length; value += 1) {
    if (histogram[value]) return value;
  }
  return 0;
}

function lastOccupiedBin(histogram: Uint32Array): number {
  for (let value = histogram.length - 1; value >= 0; value -= 1) {
    if (histogram[value]) return value;
  }
  return 255;
}

function patchBytes(patch: GrayPatch): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(patch.data);
  const expectedLength = patch.width * patch.height;
  if (bytes.length !== expectedLength) {
    throw new Error(`ROI patch contains ${bytes.length} pixels; expected ${expectedLength}`);
  }
  return bytes;
}

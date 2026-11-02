import { describe, expect, it } from 'vitest';
import {
  comparisonToRgba,
  contrastRangeForPatches,
  grayPatchToRgba,
} from './patchRendering';
import type { GrayPatch } from '@/types';

function patch(width: number, height: number, values: number[]): GrayPatch {
  return {
    width,
    height,
    data: Uint8Array.from(values).buffer,
  };
}

describe('ROI history rendering', () => {
  it('renders an exact grayscale patch as opaque RGBA', () => {
    const rendered = grayPatchToRgba(patch(2, 1, [12, 240]));

    expect(rendered.width).toBe(2);
    expect(rendered.height).toBe(1);
    expect(Array.from(rendered.data)).toEqual([
      12, 12, 12, 255,
      240, 240, 240, 255,
    ]);
  });

  it('uses one robust display range for both edge patches', () => {
    const fixed = patch(2, 2, [0, 10, 20, 100]);
    const moving = patch(2, 2, [0, 30, 40, 200]);
    const range = contrastRangeForPatches([fixed, moving]);
    const rendered = grayPatchToRgba(patch(2, 1, [0, 100]), range);

    expect(range).toEqual({ min: 0, max: 100, gamma: 0.72 });
    expect(Array.from(rendered.data)).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);
  });

  it('renders the diagnostic overlay with fixed T1 in magenta and moving T2 in cyan', () => {
    const rendered = comparisonToRgba(
      patch(2, 1, [20, 200]),
      patch(2, 1, [80, 150]),
      'overlay',
    );

    expect(Array.from(rendered.data)).toEqual([
      20, 80, 80, 255,
      200, 150, 150, 255,
    ]);
  });

  it('renders an absolute grayscale difference', () => {
    const rendered = comparisonToRgba(
      patch(2, 1, [20, 200]),
      patch(2, 1, [80, 150]),
      'difference',
    );

    expect(Array.from(rendered.data)).toEqual([
      60, 60, 60, 255,
      50, 50, 50, 255,
    ]);
  });

  it('rejects mismatched comparison dimensions', () => {
    expect(() => comparisonToRgba(
      patch(1, 1, [10]),
      patch(2, 1, [10, 20]),
      'difference',
    )).toThrow(/matching dimensions/);
  });

  it('rejects malformed patch buffers', () => {
    expect(() => grayPatchToRgba(patch(2, 2, [10, 20])))
      .toThrow(/expected 4/);
  });
});

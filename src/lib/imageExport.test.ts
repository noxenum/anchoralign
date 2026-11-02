import { describe, expect, it, vi } from 'vitest';
import { drawAlignedImage, withPngResolution } from './imageExport';
import { readImageResolution } from './imageResolution';

describe('aligned PNG rendering', () => {
  it('uses the native T1 canvas and maps row-major affine values to the canvas API', () => {
    const source = {} as CanvasImageSource;
    const context = { canvas: { width: 0, height: 0 }, setTransform: vi.fn(), drawImage: vi.fn() };
    drawAlignedImage(context as unknown as CanvasRenderingContext2D, source, [0, -1, 400, 1, 0, 12], { width: 1439, height: 1713 });
    expect(context.canvas).toEqual({ width: 1439, height: 1713 });
    expect(context.setTransform).toHaveBeenCalledWith(0, 1, -1, 0, 400, 12);
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0);
  });
});

describe('exported PNG resolution', () => {
  // Signature plus a 1×1 IHDR chunk, as written by canvas.toBlob.
  const minimalPng = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0, 0x3a, 0x7e, 0x9b, 0x55,
    0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  it('writes a pHYs chunk that reads back as the calibration', () => {
    const png = withPngResolution(minimalPng, 8.11);
    const resolution = readImageResolution(png.buffer);
    expect(resolution?.tag).toBe('PNG');
    expect(resolution?.pxPerMm).toBeCloseTo(8.11, 3);
    expect(png.length).toBe(minimalPng.length + 21);
  });

  it('writes the same bytes as common encoders for 72 dpi', () => {
    const png = withPngResolution(minimalPng, 2.835);
    // length 9, "pHYs", 2835 px/m twice, unit metre, CRC 0x009a9c18
    expect(Array.from(png.subarray(33, 54))).toEqual([
      0, 0, 0, 9, 0x70, 0x48, 0x59, 0x73, 0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1, 0x00, 0x9a, 0x9c, 0x18,
    ]);
  });
});

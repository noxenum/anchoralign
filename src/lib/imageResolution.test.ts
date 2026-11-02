import { describe, expect, it } from 'vitest';
import {
  readImageResolution, nextCalibration, calibrationWarnings, calibrationLabel,
  dpiToPxPerMm, pxPerMmToDpi, type ImageResolution,
} from './imageResolution';

function bytes(...parts: (number[] | Uint8Array | string)[]): ArrayBuffer {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') for (const ch of part) out.push(ch.charCodeAt(0));
    else out.push(...part);
  }
  return new Uint8Array(out).buffer;
}

const u16 = (v: number, le = false) => (le ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
const u32 = (v: number, le = false) => {
  const be = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  return le ? be.reverse() : be;
};

// Minimal TIFF with IFD0 = XResolution, YResolution, ResolutionUnit.
function tiff(x: number, y: number, unit: number, le: boolean): number[] {
  const ifdOffset = 8;
  const entries = 3;
  const dataOffset = ifdOffset + 2 + entries * 12 + 4;
  const entry = (tag: number, type: number, count: number, value: number[]) => [...u16(tag, le), ...u16(type, le), ...u32(count, le), ...value];
  return [
    ...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42, le), ...u32(ifdOffset, le),
    ...u16(entries, le),
    ...entry(0x011a, 5, 1, u32(dataOffset, le)),
    ...entry(0x011b, 5, 1, u32(dataOffset + 8, le)),
    ...entry(0x0128, 3, 1, [...u16(unit, le), 0, 0]),
    ...u32(0, le),
    ...u32(x, le), ...u32(1, le),
    ...u32(y, le), ...u32(1, le),
  ];
}

function jpegWithExif(x: number, y: number, unit: number, le = false): ArrayBuffer {
  const payload = [...Array.from('Exif\0\0', (c) => c.charCodeAt(0)), ...tiff(x, y, unit, le)];
  return bytes([0xff, 0xd8], [0xff, 0xe1], u16(payload.length + 2), payload, [0xff, 0xda, 0, 2]);
}

function jpegWithJfif(units: number, x: number, y: number): ArrayBuffer {
  const payload = [...Array.from('JFIF\0', (c) => c.charCodeAt(0)), 1, 1, units, ...u16(x), ...u16(y), 0, 0];
  return bytes([0xff, 0xd8], [0xff, 0xe0], u16(payload.length + 2), payload, [0xff, 0xda, 0, 2]);
}

function pngWithPhys(perMetre: number, unit = 1): ArrayBuffer {
  const chunk = (type: string, data: number[]) => [...u32(data.length), ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk('IHDR', new Array(13).fill(0)),
    chunk('pHYs', [...u32(perMetre), ...u32(perMetre), unit]),
    chunk('IDAT', []),
  );
}

describe('image resolution metadata', () => {
  it('reads EXIF dpi from a JPEG in both byte orders', () => {
    for (const le of [false, true]) {
      const res = readImageResolution(jpegWithExif(206, 206, 2, le));
      expect(res).toMatchObject({ dpiX: 206, dpiY: 206, tag: 'EXIF', placeholder: false });
      expect(res!.pxPerMm).toBeCloseTo(8.11, 2);
    }
  });

  it('converts EXIF dots per cm and ignores unitless EXIF', () => {
    expect(readImageResolution(jpegWithExif(80, 80, 3))!.dpiX).toBeCloseTo(203.2, 6);
    expect(readImageResolution(jpegWithExif(206, 206, 1))).toBeNull();
  });

  it('falls back to the JFIF density', () => {
    expect(readImageResolution(jpegWithJfif(1, 300, 300))).toMatchObject({ dpiX: 300, tag: 'JFIF' });
    expect(readImageResolution(jpegWithJfif(2, 80, 80))!.dpiX).toBeCloseTo(203.2, 6);
    expect(readImageResolution(jpegWithJfif(0, 1, 1))).toBeNull();
  });

  it('reads the PNG pHYs chunk', () => {
    const res = readImageResolution(pngWithPhys(8110));
    expect(res).toMatchObject({ tag: 'PNG' });
    expect(res!.pxPerMm).toBeCloseTo(8.11, 6);
    expect(readImageResolution(pngWithPhys(8110, 0))).toBeNull();
  });

  it('flags placeholder densities and survives truncated or foreign data', () => {
    expect(readImageResolution(jpegWithJfif(1, 72, 72))!.placeholder).toBe(true);
    expect(readImageResolution(jpegWithExif(96, 96, 2))!.placeholder).toBe(true);
    expect(readImageResolution(jpegWithExif(206, 206, 2).slice(0, 30))).toBeNull();
    expect(readImageResolution(bytes('GIF89a'))).toBeNull();
  });

  it('round-trips dpi and px/mm', () => {
    expect(dpiToPxPerMm(206)).toBeCloseTo(8.1102, 4);
    expect(pxPerMmToDpi(dpiToPxPerMm(206))).toBeCloseTo(206, 10);
  });
});

describe('calibration source', () => {
  const res = (dpi: number, placeholder = false): ImageResolution => ({ dpiX: dpi, dpiY: dpi, pxPerMm: dpi / 25.4, tag: 'EXIF', placeholder });

  it('prefers T1 metadata, then T2, and never overrides a manual value', () => {
    expect(nextCalibration({ kind: 'default' }, { t2: res(150) })).toMatchObject({ kind: 'metadata', image: 't2' });
    expect(nextCalibration({ kind: 'default' }, { t1: res(206), t2: res(150) })).toMatchObject({ kind: 'metadata', image: 't1' });
    expect(nextCalibration({ kind: 'default' }, { t1: res(72, true), t2: res(150) })).toMatchObject({ kind: 'metadata', image: 't2' });
    expect(nextCalibration({ kind: 'manual' }, { t1: res(206) })).toEqual({ kind: 'manual' });
  });

  it('keeps a metadata value when the source image is replaced without metadata', () => {
    const fromT1 = nextCalibration({ kind: 'default' }, { t1: res(206) });
    expect(nextCalibration(fromT1, { t1: null })).toEqual({ kind: 'kept' });
    expect(nextCalibration({ kind: 'default' }, { t1: null })).toEqual({ kind: 'default' });
  });

  it('labels the source and warns about mismatches and placeholders', () => {
    const source = nextCalibration({ kind: 'default' }, { t1: res(206) });
    expect(calibrationLabel(source)).toBe('EXIF T1');
    expect(calibrationWarnings(206 / 25.4, source, { t1: res(206) }, true)).toEqual([]);

    const mixed = calibrationWarnings(206 / 25.4, source, { t1: res(206), t2: res(150) }, true);
    expect(mixed).toHaveLength(2);
    expect(mixed[0]).toContain('T2 metadata says 150 dpi');

    expect(calibrationWarnings(4.2, { kind: 'default' }, { t1: res(72, true) }, true)[0]).toContain('72 dpi ignored');
    expect(calibrationWarnings(4.2, { kind: 'default' }, {}, false)).toEqual([]);

    const rounded = { ...res(206), dpiX: 205.98 };
    expect(calibrationWarnings(rounded.pxPerMm, source, { t1: rounded }, true)).toEqual([]);
    expect(calibrationWarnings(206 / 25.4, source, { t1: { ...res(206), dpiY: 150 } }, true)[0]).toContain('non-square');
  });
});

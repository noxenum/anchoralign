import { describe, expect, it } from 'vitest';
import {
  calibrationWarnings, initialCalibration, isUniform, nextCalibration, resetCalibration, scaledSize, sourceLabel,
  toWorkingScale, withManualScale, workingPxPerMm, type Calibration,
} from './calibration';
import { DEFAULT_PX_PER_MM } from './geometry';
import type { ImageResolution } from './imageResolution';

const res = (dpiX: number, dpiY = dpiX, placeholder = false): ImageResolution => ({
  dpiX, dpiY, pxPerMm: dpiX / 25.4, tag: 'EXIF', placeholder,
});
const both = { t1: true, t2: true };
const fresh = initialCalibration();

describe('calibration per image', () => {
  it('uses each image\'s own metadata', () => {
    const cal = nextCalibration(fresh, { t1: res(206), t2: res(150) });
    expect(cal.t1.scale.x).toBeCloseTo(206 / 25.4, 10);
    expect(cal.t2.scale.x).toBeCloseTo(150 / 25.4, 10);
    expect(sourceLabel(cal.t1.source)).toBe('EXIF T1');
    expect(sourceLabel(cal.t2.source)).toBe('EXIF T2');
    expect(isUniform(cal)).toBe(false);
  });

  it('falls back to the other image\'s metadata, skipping placeholders', () => {
    const cal = nextCalibration(fresh, { t1: res(72, 72, true), t2: res(150) });
    expect(sourceLabel(cal.t1.source)).toBe('EXIF T2');
    expect(cal.t1.scale).toEqual(cal.t2.scale);
    expect(isUniform(cal)).toBe(true);
  });

  it('never overrides a manual value and resets to the metadata on request', () => {
    const manual = withManualScale(fresh, ['t1', 't2'], { x: 8, y: 8 });
    const cal = nextCalibration(manual, { t1: res(206) });
    expect(cal.t1).toEqual({ scale: { x: 8, y: 8 }, source: { kind: 'manual' } });
    expect(sourceLabel(resetCalibration({ t1: res(206) }).t2.source)).toBe('EXIF T1');
  });

  it('keeps a metadata value when the source image is replaced without metadata', () => {
    const fromT1 = nextCalibration(fresh, { t1: res(206) });
    expect(nextCalibration(fromT1, { t1: null }).t1.source).toEqual({ kind: 'kept' });
    expect(nextCalibration(fresh, { t1: null }).t1.source).toEqual({ kind: 'default' });
  });

  it('treats rounding differences between x and y as square pixels', () => {
    const cal = nextCalibration(fresh, { t1: res(206, 205.98) });
    expect(cal.t1.scale.y).toBe(cal.t1.scale.x);
    expect(toWorkingScale(cal, 't1')).toBeNull();
  });
});

describe('alignment frame', () => {
  it('resamples non-square T1 pixels up to its finer resolution', () => {
    const cal = nextCalibration(fresh, { t1: res(206, 202), t2: res(206) });
    expect(workingPxPerMm(cal)).toBeCloseTo(206 / 25.4, 10);
    const t1 = toWorkingScale(cal, 't1');
    expect(t1?.[0]).toBeCloseTo(1, 10);
    expect(t1?.[4]).toBeCloseTo(206 / 202, 10);
    expect(scaledSize({ width: 1000, height: 1010 }, t1)).toEqual({ width: 1000, height: 1030 });
    expect(toWorkingScale(cal, 't2')).toBeNull();
  });

  it('rescales T2 to T1\'s scale', () => {
    const cal = nextCalibration(fresh, { t1: res(200), t2: res(100) });
    expect(toWorkingScale(cal, 't1')).toBeNull();
    expect(toWorkingScale(cal, 't2')).toEqual([2, 0, 0, 0, 2, 0]);
  });
});

describe('calibration warnings', () => {
  const warn = (cal: Calibration, resolutions = {}, loaded = both) => calibrationWarnings(cal, resolutions, loaded);

  it('is quiet when both images agree with their metadata', () => {
    expect(warn(nextCalibration(fresh, { t1: res(206), t2: res(206) }), { t1: res(206), t2: res(206) })).toEqual([]);
    expect(warn(fresh, {}, { t1: false, t2: false })).toEqual([]);
  });

  it('flags different calibrations, non-square pixels and resampling', () => {
    const resolutions = { t1: res(206, 202), t2: res(150) };
    const warnings = warn(nextCalibration(fresh, resolutions), resolutions);
    expect(warnings.some((w) => w.includes('T1 has non-square pixels (206 × 202 dpi)') && w.includes('resampled'))).toBe(true);
    expect(warnings.some((w) => w.includes('calibrated differently'))).toBe(true);
  });

  it('flags manual values that contradict the metadata, placeholders and the default', () => {
    const manual = withManualScale(nextCalibration(fresh, { t1: res(206) }), ['t1'], { x: 8, y: 8 });
    expect(warn(manual, { t1: res(206) }, { t1: true, t2: false })[0]).toContain('T1 metadata says 206 dpi');
    expect(warn(fresh, { t1: res(72, 72, true) }, { t1: true, t2: false })[0]).toContain('72 dpi ignored');
    expect(warn(fresh, {}, both)).toEqual([`No resolution in the metadata of T1 and T2; using the default ${DEFAULT_PX_PER_MM.toFixed(2)} px/mm.`]);
  });
});

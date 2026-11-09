import { describe, expect, it } from 'vitest';
import { resultsCsv } from './resultsExport';
import { stageDef } from './stages';
import type { AlignmentResult } from '@/types';

const result = {
  totalAngle: -4.7012, rp1b2DxMm: -2.4, rp1b2DyMm: 0.17, rp1b2DisplaceMm: 2.406,
  score: 0.92205, roi1Score: 0.9409, roi2Score: -Infinity, cyclesRun: 3,
  terminationReason: 'both-rejected', searchLimitHit: false,
} as AlignmentResult;

const context = {
  t1Name: 'case-01-T1.jpg', t2Name: 'scan "2", final.png', pxPerMm: 8.11,
  calibration: {
    t1: { scale: { x: 8.11, y: 8.11 }, source: 'EXIF T1' },
    t2: { scale: { x: 7.95, y: 7.8 }, source: 'manual' },
  },
  preprocessMode: 'raw' as const, version: '0.1.0', exportedAt: new Date('2026-11-02T10:00:00Z'),
};

describe('results CSV', () => {
  it('writes one row per superimposition with rotation and RP1B2 translation first', () => {
    const csv = resultsCsv([
      { stage: stageDef('cranialBase'), reference: 'T1', params: stageDef('cranialBase').defaults, result },
    ], context);
    const [header, row] = csv.trimEnd().split('\r\n');
    expect(header.split(',').slice(0, 7)).toEqual([
      'superimposition', 'relative_to', 'rotation_deg', 'rp1b2_dx_mm', 'rp1b2_dy_mm', 'rp1b2_displacement_mm', 'alignment_score',
    ]);
    expect(row.startsWith('Cranial base,T1,-4.7012,-2.4000,0.1700,2.4060,0.9221,0.9409,,converged,3,gray,ring segment,10,3,10,0.01,0.01,4,raw,8.1100,8.1100,8.1100,EXIF T1,7.9500,7.8000,manual,case-01-T1.jpg')).toBe(true);
  });

  it('quotes cells with commas and quotes', () => {
    const csv = resultsCsv([
      { stage: stageDef('maxilla'), reference: 'cranial base', params: stageDef('maxilla').defaults, result },
    ], context);
    expect(csv).toContain('case-01-T1.jpg,"scan ""2"", final.png",0.1.0,2026-11-02T10:00:00.000Z');
  });
});

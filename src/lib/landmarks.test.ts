import { describe, expect, it } from 'vitest';
import { EMPTY_LANDMARKS, activeLandmark, countPlaced, isComplete, withPoint } from './landmarks';
import { stageDef, stageLandmarks } from './stages';
import type { LandmarkDraft } from '@/types';

const p = { x: 1, y: 2 };
const complete: LandmarkDraft = { t1: { rp1: p, rp2: p }, t2: { rp1: p, rp2: p } };
const cranialBase = stageDef('cranialBase');
const maxilla = stageDef('maxilla');

describe('stage landmarks', () => {
  it('lists each structure on T1, then on T2', () => {
    expect(stageLandmarks(cranialBase).map((m) => `${m.code} ${m.name}`)).toEqual([
      "RP1B1 Walker's point", "RP1B2 Walker's point", 'RP2B1 Cribriform plate', 'RP2B2 Cribriform plate',
    ]);
    expect(stageLandmarks(maxilla).map((m) => m.code)).toEqual(['RP1B1', 'RP1B2']);
  });

  it('counts clicks and completeness', () => {
    expect(countPlaced(cranialBase, EMPTY_LANDMARKS)).toBe(0);
    expect(countPlaced(cranialBase, { ...EMPTY_LANDMARKS, t2: { rp1: p, rp2: null } })).toBe(1);
    expect(isComplete(EMPTY_LANDMARKS)).toBe(false);
    expect(isComplete(complete)).toBe(true);
  });

  it('mirrors RP1 into RP2 for a single-point stage', () => {
    let points = withPoint(maxilla, EMPTY_LANDMARKS, 't1', 'rp1', p);
    points = withPoint(maxilla, points, 't2', 'rp1', { x: 3, y: 4 });
    expect(points).toEqual({ t1: { rp1: p, rp2: p }, t2: { rp1: { x: 3, y: 4 }, rp2: { x: 3, y: 4 } } });
    expect(countPlaced(maxilla, points)).toBe(2);
    expect(isComplete(points)).toBe(true);
    expect(isComplete(withPoint(maxilla, points, 't2', 'rp1', null))).toBe(false);
  });

  it('activates landmarks in placement order, alternating T1 and T2', () => {
    expect(activeLandmark(cranialBase, EMPTY_LANDMARKS, null).code).toBe('RP1B1');
    expect(activeLandmark(cranialBase, { ...EMPTY_LANDMARKS, t1: { rp1: p, rp2: null } }, null).code).toBe('RP1B2');
    expect(activeLandmark(cranialBase, { t1: { rp1: p, rp2: null }, t2: { rp1: p, rp2: null } }, null).code).toBe('RP2B1');
  });

  it('prefers the selected landmark while it is unplaced', () => {
    expect(activeLandmark(cranialBase, EMPTY_LANDMARKS, 'cranialBase:rp2-t2').code).toBe('RP2B2');
    expect(activeLandmark(cranialBase, { ...EMPTY_LANDMARKS, t2: { rp1: null, rp2: p } }, 'cranialBase:rp2-t2').code).toBe('RP1B1');
    expect(activeLandmark(cranialBase, complete, null).code).toBe('RP2B2');
  });
});

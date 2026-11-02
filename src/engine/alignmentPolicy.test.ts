import { describe, expect, it } from 'vitest';
import {
  alignmentScore,
  cycleTerminationReason,
  evaluateCandidate,
  isScoreImprovement,
  normalizeMaxCycles,
} from './alignmentPolicy';

describe('alignment acceptance policy', () => {
  const baseline = { valid: true, roi1Score: 0.8, roi2Score: 0.7 };

  it('uses grayscale only by default, regardless of edges', () => {
    for (const edges of [-1, 0, 1, null, NaN]) {
      expect(alignmentScore(0.8, edges)).toBe(0.8);
      expect(alignmentScore(0.8, edges, 'gray')).toBe(0.8);
    }
    expect(alignmentScore(0.8, 0.2, 'blend')).toBeCloseTo(0.44);
    expect(alignmentScore(0.8, null, 'blend')).toBe(0.8);
    expect(alignmentScore(NaN, 1, 'gray')).toBe(-Infinity);
  });

  it('accepts on the objective alone, even if the other fixed-frame ROI gets worse', () => {
    // Customer cases: rotation ROI2 0.9829 → 0.9832 while fixed ROI1 0.8561 → 0.8559;
    // translation ROI1 0.8561 → 0.8944 while fixed ROI2 0.9837 → 0.9804.
    expect(evaluateCandidate(0.9829, 0.9832, { valid: true, roi1Score: 0.8559, roi2Score: 0.9782 }))
      .toEqual({ accepted: true, rejectionReasons: [] });
    expect(evaluateCandidate(0.8561, 0.8944, { valid: true, roi1Score: 0.8944, roi2Score: 0.9804 }))
      .toEqual({ accepted: true, rejectionReasons: [] });
  });

  it('rejects when the objective does not improve by more than 0.0001', () => {
    expect(evaluateCandidate(0.5, 0.6, baseline).accepted).toBe(true);
    expect(evaluateCandidate(0.5, 0.5001, baseline))
      .toEqual({ accepted: false, rejectionReasons: ['insufficient-improvement'] });
  });

  it('rejects candidates whose ROIs leave the image', () => {
    expect(evaluateCandidate(0.5, 0.6, { ...baseline, valid: false }).rejectionReasons).toEqual(['invalid-roi']);
    expect(evaluateCandidate(0.5, 0.6, { ...baseline, roi2Score: -Infinity }).rejectionReasons).toEqual(['invalid-roi']);
  });

  it('accepts only improvements strictly greater than 0.0001', () => {
    expect(isScoreImprovement(0.5, 0.5001001)).toBe(true);
    expect(isScoreImprovement(0.5, 0.5001)).toBe(false);
    expect(isScoreImprovement(0.5, 0.4999)).toBe(false);
  });

  it('continues when exactly one step is accepted', () => {
    expect(cycleTerminationReason(true, false, 1, 4)).toBeNull();
    expect(cycleTerminationReason(false, true, 1, 4)).toBeNull();
  });

  it('stops when rotation and translation are both rejected', () => {
    expect(cycleTerminationReason(false, false, 1, 4)).toBe('both-rejected');
  });

  it('prefers both-rejected when convergence occurs in the last cycle', () => {
    expect(cycleTerminationReason(false, false, 4, 4)).toBe('both-rejected');
  });

  it('stops at the configured maximum after any accepted step', () => {
    expect(cycleTerminationReason(true, false, 4, 4)).toBe('max-cycles');
    expect(cycleTerminationReason(false, true, 4, 4)).toBe('max-cycles');
  });

  it('normalizes the configurable range to 1–12 cycles with default 4', () => {
    expect(normalizeMaxCycles(undefined)).toBe(4);
    expect(normalizeMaxCycles(0)).toBe(1);
    expect(normalizeMaxCycles(6.6)).toBe(7);
    expect(normalizeMaxCycles(99)).toBe(12);
  });
});

import type { FixedFrameScores, RejectionReason, ScoreMode } from '@/types';

export const SCORE_EPSILON = 1e-4;
export const MIN_ALIGNMENT_CYCLES = 1;
export const MAX_ALIGNMENT_CYCLES = 12;
export const DEFAULT_ALIGNMENT_CYCLES = 4;

export type TerminationReason = 'both-rejected' | 'max-cycles';

export function normalizeMaxCycles(value: unknown): number {
  const finiteValue = Number.isFinite(value) ? Number(value) : DEFAULT_ALIGNMENT_CYCLES;
  return Math.min(MAX_ALIGNMENT_CYCLES, Math.max(MIN_ALIGNMENT_CYCLES, Math.round(finiteValue)));
}

export function isScoreImprovement(baselineScore: number, candidateScore: number, epsilon = SCORE_EPSILON): boolean {
  return Number.isFinite(baselineScore) &&
    Number.isFinite(candidateScore) &&
    candidateScore > baselineScore + epsilon;
}

export function alignmentScore(grayNcc: number, edgeNcc: number | null, scoreMode: ScoreMode = 'gray'): number {
  if (!Number.isFinite(grayNcc)) return -Infinity;
  if (scoreMode !== 'blend' || !Number.isFinite(edgeNcc)) return grayNcc;
  return 0.4 * grayNcc + 0.6 * edgeNcc;
}

// A step is accepted when its own objective improves (rotation: moving-centre
// ROI2, translation: fixed-frame ROI1). The other ROI does not veto it; both
// candidate ROIs only have to lie inside the image.
export function evaluateCandidate(
  baselineScore: number,
  candidateScore: number,
  candidate: FixedFrameScores,
): { accepted: boolean; rejectionReasons: RejectionReason[] } {
  const rejectionReasons: RejectionReason[] = [];
  if (!candidate.valid || !Number.isFinite(candidate.roi1Score) || !Number.isFinite(candidate.roi2Score)) {
    rejectionReasons.push('invalid-roi');
  }
  if (!isScoreImprovement(baselineScore, candidateScore)) rejectionReasons.push('insufficient-improvement');
  return { accepted: rejectionReasons.length === 0, rejectionReasons };
}

export function cycleTerminationReason(
  rotationAccepted: boolean,
  translationAccepted: boolean,
  cycle: number,
  maxCycles: number,
): TerminationReason | null {
  if (!rotationAccepted && !translationAccepted) return 'both-rejected';
  if (cycle >= maxCycles) return 'max-cycles';
  return null;
}

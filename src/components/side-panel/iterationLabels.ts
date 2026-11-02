import { formatSigned } from '@/lib/format';
import type { IterationEvent } from '@/types';

export function iterationStepName(iteration: IterationEvent): string {
  if (iteration.kind === 'ring') return 'Ring rot+tr';
  return iteration.kind === 'rot' ? 'ROI₂ rot' : 'ROI₁ tr';
}

export function historyStepLabel(iteration: IterationEvent): string {
  const cycle = `Cycle ${iteration.cycle}`;
  if (iteration.kind === 'ring') return `${cycle} · ring segment (rotation + translation)`;
  if (iteration.kind === 'rot') return `${cycle} · rotation`;
  return `${cycle} · translation`;
}

export function historyDeltaLabel(iteration: IterationEvent): string {
  const angle = `${formatSigned(iteration.candidateDAngle ?? iteration.dAngle, 2)}°`;
  const shift = `x/y ${formatSigned(iteration.candidateDx ?? iteration.dx, 2)}, ${formatSigned(iteration.candidateDy ?? iteration.dy, 2)} mm`;
  if (iteration.kind === 'ring') return `candidate ${angle} · ${shift}`;
  if (iteration.kind === 'rot') return `candidate ${angle}`;
  return `candidate ${shift}`;
}

export function historyDecisionLabel(iteration: IterationEvent): string {
  const change = `${iteration.baselineScore.toFixed(4)} → ${iteration.candidateScore.toFixed(4)} (Δ${formatSigned(iteration.objectiveDelta, 4)})`;
  if (iteration.objective === 'ring') {
    const selection = Number.isFinite(iteration.selectionScore) ? ` · angle chosen by ROI₂ fixed frame ${iteration.selectionScore.toFixed(4)}` : '';
    return `Overall fixed frame: ${change}${selection}`;
  }
  const objective = iteration.objective === 'roi2' ? 'ROI₂ moving centre' : 'ROI₁ fixed frame';
  return `${objective}: ${change}`;
}

const REJECTION_LABELS = {
  'invalid-roi': 'Candidate ROI extends outside the image',
  'insufficient-improvement': 'Objective improvement ≤ 0.0001',
};

export function rejectionLabel(iteration: IterationEvent): string {
  return (iteration.rejectionReasons ?? []).map((reason) => REJECTION_LABELS[reason]).join('; ');
}

export function fixedFrameLabel(iteration: IterationEvent): string {
  const before = iteration.fixedFrameBaseline;
  const after = iteration.fixedFrameCandidate;
  if (!before || !after) return '';
  const score = (value: number) => Number.isFinite(value) ? value.toFixed(4) : 'invalid';
  return `Fixed-frame (info) · ROI₁ ${score(before.roi1Score)} → ${score(after.roi1Score)} · ROI₂ ${score(before.roi2Score)} → ${score(after.roi2Score)}`;
}

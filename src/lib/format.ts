import type { AlignmentResult } from '@/types';

export function formatScore(value: number | null | undefined, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export function formatSigned(value: number | null | undefined, digits: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

// Outcome of an alignment; `warn` marks results that need review.
export function alignmentStatus(results: AlignmentResult | null): { label: string; warn: boolean } {
  if (results?.terminationReason === 'pre-alignment-only') return { label: 'pre-alignment selected', warn: false };
  if (results?.searchLimitHit) return { label: 'search limit reached', warn: true };
  if (results?.terminationReason === 'max-cycles') return { label: 'maximum cycles reached', warn: true };
  return { label: 'converged', warn: false };
}

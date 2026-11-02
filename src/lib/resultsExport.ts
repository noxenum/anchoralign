import type { AlignmentParams, StageDef } from '@/lib/stages';
import type { AlignmentResult, PreprocessMode } from '@/types';

export type StageResultRow = {
  stage: StageDef;
  // Frame the rotation and translation refer to, e.g. "T1" or "cranial base".
  reference: string;
  params: AlignmentParams;
  result: AlignmentResult;
};

export type ResultsContext = {
  t1Name: string;
  t2Name: string;
  pxPerMm: number;
  calibrationSource: string;
  preprocessMode: PreprocessMode;
  version: string;
  exportedAt: Date;
};

const COLUMNS = [
  'superimposition', 'relative_to', 'rotation_deg', 'rp1b2_dx_mm', 'rp1b2_dy_mm', 'rp1b2_displacement_mm',
  'alignment_score', 'roi1_score', 'roi2_score', 'status', 'cycles',
  'score_mode', 'rotation_search', 'roi1_mm', 'roi2_w_mm', 'roi2_h_mm', 'rotation_step_deg', 'translation_step_mm', 'max_cycles',
  'preprocessing', 'px_per_mm', 'calibration_source', 't1_image', 't2_image', 'app_version', 'exported_at',
];

function csvCell(value: string | number | null | undefined): string {
  if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const fixed = (value: number, digits = 4) => (Number.isFinite(value) ? value.toFixed(digits) : null);

function status(result: AlignmentResult): string {
  if (result.terminationReason === 'pre-alignment-only') return 'pre-alignment only';
  if (result.searchLimitHit) return 'search limit reached';
  if (result.terminationReason === 'max-cycles') return 'maximum cycles reached';
  return 'converged';
}

// One CSV row per superimposition.
export function resultsCsv(rows: StageResultRow[], context: ResultsContext): string {
  const lines = rows.map(({ stage, reference, params, result }) => [
    stage.name, reference,
    fixed(result.totalAngle), fixed(result.rp1b2DxMm), fixed(result.rp1b2DyMm), fixed(result.rp1b2DisplaceMm),
    fixed(result.score), fixed(result.roi1Score), fixed(result.roi2Score), status(result), result.cyclesRun,
    params.scoreMode === 'blend' ? '40% gray / 60% edge' : 'gray', params.rotationMode === 'ring' ? 'ring segment' : 'moving centre',
    params.roi1Mm, params.roi2W, params.roi2H, params.stepDeg, params.stepMm, params.maxCycles,
    context.preprocessMode, fixed(context.pxPerMm), context.calibrationSource,
    context.t1Name, context.t2Name, context.version, context.exportedAt.toISOString(),
  ].map(csvCell).join(','));
  return [COLUMNS.join(','), ...lines].join('\r\n') + '\r\n';
}

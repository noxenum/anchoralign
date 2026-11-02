import { Tooltip } from '@/components/common/Tooltip';
import { decompose } from '@/lib/geometry';
import { formatScore } from '@/lib/format';
import type { Affine6, PreprocessMode } from '@/types';

type StatusBarProps = {
  engineStatus: string;
  tone: 'run' | 'ok' | 'idle';
  // Active superimposition and its phase, e.g. "Mandible · placing 2 / 4".
  stageLabel: string;
  transform: Affine6 | null;
  pxPerMm: number;
  roi1Score: number | undefined;
  roi2Score: number | undefined;
  preprocessMode: PreprocessMode;
};

export function StatusBar({ engineStatus, tone, stageLabel, transform, pxPerMm, roi1Score, roi2Score, preprocessMode }: StatusBarProps) {
  const summary = transform ? decompose(transform) : null;
  return (
    <footer className="bottombar">
      <span className={`pill ${tone}`}>
        <span className="dot" />
        engine: {engineStatus}
      </span>
      <span>·</span>
      <span>{stageLabel}</span>
      <span>·</span>
      <span>θ_total {summary ? summary.angleDeg.toFixed(2) : '0.00'}°</span>
      <span>·</span>
      <span>t_matrix {summary ? Math.hypot(summary.tx / pxPerMm, summary.ty / pxPerMm).toFixed(2) : '0.00'} mm</span>
      <span className="spacer" />
      {/* Secondary readings, hidden on narrow screens so the notice stays visible. */}
      <span className="secondary">
        <span>Score ROI₁ {formatScore(roi1Score)}</span>
        <span>·</span>
        <span>Score ROI₂ {formatScore(roi2Score)}</span>
        <span>·</span>
        <span>{preprocessMode === 'clahe' ? 'CLAHE' : 'Raw'}</span>
        <span>·</span>
      </span>
      <span>build {__APP_VERSION__}</span>
      <span>·</span>
      <Tooltip content="anchoralign is intended for research and education only. It must not be used for diagnosis, treatment planning or any other clinical decision about patients." placement="top">
        <span className="disclaimer">research use only · not a medical device</span>
      </Tooltip>
    </footer>
  );
}

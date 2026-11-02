import { TriangleAlert } from 'lucide-react';
import { InfoTip } from '@/components/common/Tooltip';
import { HELP } from '@/components/helpText';
import { alignmentStatus, formatScore } from '@/lib/format';
import { isSinglePoint, type StageDef } from '@/lib/stages';
import type { AlignmentResult, ImagePair, PreAlignSummary, PreprocessMode, RoiConfig } from '@/types';
import { StatCard } from './StatCard';

type InspectorTabProps = {
  stage: StageDef;
  // Whether the stage is superimposed on the cranial-base aligned T2.
  chained: boolean;
  roi: RoiConfig;
  preAlign: PreAlignSummary | null;
  results: AlignmentResult | null;
  images: ImagePair;
  pxPerMm: number;
  calibrationLabel: string;
  calibrationWarnings: string[];
  preprocessMode: PreprocessMode;
};

const mm = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '—');

export function InspectorTab({
  stage, chained, roi, preAlign, results, images, pxPerMm, calibrationLabel, calibrationWarnings, preprocessMode,
}: InspectorTabProps) {
  return (
    <>
      {results ? <FinalTransform results={results} pxPerMm={pxPerMm} /> : (
        <div className="section empty-note">No result yet. Place the reference points and run the alignment.</div>
      )}

      {preAlign && (
        <div className="section">
          <div className="section-h"><span>Pre-alignment</span><span className="h-meta">V₂ → V₁</span></div>
          <div className="kv">
            <div className="k">Rotation</div><div className="v">{preAlign.angle.toFixed(2)}°</div>
            <div className="k">Translation x / y</div><div className="v">{preAlign.tx_mm.toFixed(2)}, {preAlign.ty_mm.toFixed(2)} mm</div>
            {!isSinglePoint(stage) && <><div className="k">|V₁| − |V₂|</div><div className="v muted">{preAlign.dLen_mm.toFixed(2)} mm</div></>}
            <div className="k">Initial ROI₁ / ROI₂</div><div className="v">{formatScore(preAlign.roi1Score)} / {formatScore(preAlign.roi2Score)}</div>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-h"><span>Input</span>{chained && <span className="h-meta">T2 aligned on cranial base</span>}</div>
        <div className="kv">
          <div className="k">T1</div><div className="v ellipsis">{images.t1.width ?? '—'} × {images.t1.height ?? '—'} px</div>
          <div className="k">T2</div><div className="v ellipsis">{images.t2.width ?? '—'} × {images.t2.height ?? '—'} px</div>
          <div className="k">Calibration</div>
          <div className={`v ${calibrationWarnings.length ? 'warn' : ''}`}>{pxPerMm.toFixed(2)} px/mm · {calibrationLabel}</div>
          <div className="k">Preprocessing</div><div className="v">{preprocessMode === 'clahe' ? 'CLAHE' : 'Raw'}</div>
          <div className="k">ROI₁</div><div className="v">{roi.rp1.w} × {roi.rp1.h} mm</div>
          {!isSinglePoint(stage) && <><div className="k">ROI₂</div><div className="v">{roi.rp2.w} × {roi.rp2.h} mm</div></>}
        </div>
        {calibrationWarnings.length > 0 && (
          <ul className="warn-list">
            {calibrationWarnings.map((note) => <li key={note}><TriangleAlert size={12} />{note}</li>)}
          </ul>
        )}
      </div>
    </>
  );
}

function FinalTransform({ results, pxPerMm }: { results: AlignmentResult; pxPerMm: number }) {
  const status = alignmentStatus(results);
  return (
    <div className="section">
      <div className="section-h">
        <span>Result</span>
        <span className={`status-text ${status.warn ? 'warn' : 'ok'}`}>{status.label}</span>
      </div>
      <div className="results-grid">
        <StatCard label="Rotation" value={results.totalAngle.toFixed(2)} unit="°" />
        <StatCard label="Score" value={results.score.toFixed(4)} tone="ok" info={HELP.score} />
      </div>
      <div className="kv" style={{ marginTop: 12 }}>
        <div className="k">Translation RP1B2 x / y <InfoTip>{HELP.translation}</InfoTip></div>
        <div className="v strong">{results.rp1b2DxMm.toFixed(2)}, {results.rp1b2DyMm.toFixed(2)} mm</div>
        <div className="k">ROI₁ / ROI₂ score</div><div className="v">{formatScore(results.roi1Score)} / {formatScore(results.roi2Score)}</div>
      </div>
      <details className="details">
        <summary>Details</summary>
        <div className="kv">
          <div className="k">Grayscale NCC</div><div className="v">{formatScore(results.grayNcc)}</div>
          <div className="k">Edge NCC</div><div className="v">{formatScore(results.edgeNcc)}</div>
          <div className="k">RP1B2 displacement</div><div className="v">{results.rp1b2DisplaceMm.toFixed(2)} mm</div>
          <div className="k">RP1B1 transferred · observed</div><div className="v">{results.rp1b1TransferMm.toFixed(2)} mm</div>
          <div className="k">↳ x / y</div><div className="v muted">{results.rp1b1TransferDxMm.toFixed(2)}, {results.rp1b1TransferDyMm.toFixed(2)} mm</div>
          <div className="k">Applied refinement x / y</div><div className="v">{(results.accumTxPx / pxPerMm).toFixed(2)}, {(results.accumTyPx / pxPerMm).toFixed(2)} mm</div>
          <div className="k">RP1 / RP2 residual</div><div className="v">{mm(results.rp1ResidualMm)} / {mm(results.rp2ResidualMm)} mm</div>
          <div className="k">Search boundary reached</div><div className={`v ${results.searchLimitHit ? 'warn' : ''}`}>{results.searchLimitHit ? 'yes · review' : 'no'}</div>
          <div className="k">Cycles</div><div className="v">{results.cyclesRun}</div>
          <div className="k">Rotation search</div><div className="v">{results.rotationMode === 'ring' ? 'ring segment' : 'moving centre'}</div>
        </div>
      </details>
    </div>
  );
}

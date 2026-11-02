import { Tooltip } from '@/components/common/Tooltip';
import { contrastRangeForPatches } from '@/lib/patchRendering';
import type { RoiComparisonSnapshot, RoiHistorySnapshot } from '@/types';
import { PatchCanvas } from './PatchCanvas';

export type HistoryView = 'gray' | 'edge' | 'overlay' | 'difference';

export type HistoryEntry = {
  key: string;
  label: string;
  detail: string;
  decision?: string;
  protection?: string;
  rejection?: string;
  status: 'initial' | 'accepted' | 'rejected';
  hitBoundary: boolean;
  snapshot: RoiHistorySnapshot;
};

// One step of the run with the fixed and candidate patches of both ROIs.
export function HistoryFrameCard({ entry, view }: { entry: HistoryEntry; view: HistoryView }) {
  return (
    <article className={`roi-history-card ${entry.status} ${entry.hitBoundary ? 'boundary' : ''}`}>
      <header className="roi-history-card-h">
        <div>
          <div className="roi-history-title">{entry.label}</div>
          <div className="roi-history-delta">{entry.detail}</div>
          {entry.decision && <div className="roi-history-delta">{entry.decision}</div>}
        </div>
        <div className="roi-history-badges">
          <Tooltip placement="left" content={entry.rejection || entry.protection ? (
            <>
              {entry.rejection && <div className="tooltip-title">Rejected: {entry.rejection}</div>}
              {entry.protection && <div className="mono">{entry.protection}</div>}
            </>
          ) : null}>
            <span className={`history-badge ${entry.status}`}>{entry.status}</span>
          </Tooltip>
          {entry.hitBoundary && <span className="history-badge boundary">limit</span>}
        </div>
      </header>
      <HistoryRoi label="ROI₁" snapshot={entry.snapshot.roi1} view={view} />
      <HistoryRoi label="ROI₂" snapshot={entry.snapshot.roi2} view={view} />
    </article>
  );
}

function HistoryRoi({ label, snapshot, view }: { label: string; snapshot: RoiComparisonSnapshot; view: HistoryView }) {
  const score = snapshot.scores;
  const edgeScore = Number.isFinite(score.edgeNcc) ? score.edgeNcc.toFixed(4) : 'unavailable';
  const weakEdge = score.edgeUsed && score.edgeNcc < 0.15;
  const samplingLabel = snapshot.sampling === 'moving-landmark' ? 'moving centre' : 'fixed frame';

  return (
    <section className={`roi-history-roi ${snapshot.active ? 'active' : 'context'}`}>
      <div className="roi-history-roi-h">
        <span>{label}</span>
        <span className="roi-history-objective">
          {snapshot.active ? 'scored' : 'context'} · {samplingLabel}
        </span>
      </div>
      <div className="roi-history-scores">
        <span>Grayscale NCC {snapshot.valid === false ? 'invalid ROI' : score.grayNcc.toFixed(4)}</span>
        <span className={!score.edgeUsed ? 'fallback' : weakEdge ? 'weak' : ''}>
          Edge NCC {edgeScore}{weakEdge ? ' · weak' : ''}
        </span>
        <span>Alignment score {Number.isFinite(score.blendedNcc) ? score.blendedNcc.toFixed(4) : 'invalid ROI'}</span>
      </div>
      {view === 'gray' || view === 'edge' ? (
        <SidePatches snapshot={snapshot} channel={view} />
      ) : (
        <figure className="roi-history-figure composite">
          <PatchCanvas fixed={snapshot.fixed.gray} moving={snapshot.moving.gray} view={view} />
          <figcaption>{view === 'overlay' ? 'T1 magenta · T2 cyan' : '|T1 − T2|'}</figcaption>
        </figure>
      )}
    </section>
  );
}

// Fixed T1 and candidate T2 patches next to each other.
function SidePatches({ snapshot, channel }: { snapshot: RoiComparisonSnapshot; channel: 'gray' | 'edge' }) {
  const displayRange = channel === 'edge'
    ? contrastRangeForPatches([snapshot.fixed.edge, snapshot.moving.edge])
    : undefined;
  return (
    <div className="roi-history-pair">
      <figure className="roi-history-figure">
        <PatchCanvas patch={snapshot.fixed[channel]} displayRange={displayRange} />
        <figcaption>T1 · fixed</figcaption>
      </figure>
      <figure className="roi-history-figure">
        <PatchCanvas patch={snapshot.moving[channel]} displayRange={displayRange} />
        <figcaption>T2 · candidate</figcaption>
      </figure>
    </div>
  );
}

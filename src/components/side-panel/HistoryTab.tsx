import { useState } from 'react';
import { InfoTip } from '@/components/common/Tooltip';
import { Segmented } from '@/components/common/Segmented';
import { HELP } from '@/components/helpText';
import type { StagePhase } from '@/lib/workflow';
import type { IterationEvent, PreAlignSummary, RotationMode } from '@/types';
import { HistoryFrameCard, type HistoryEntry, type HistoryView } from './HistoryFrameCard';
import {
  fixedFrameLabel, historyDecisionLabel, historyDeltaLabel, historyStepLabel, rejectionLabel,
} from './iterationLabels';

type HistoryTabProps = {
  preAlign: PreAlignSummary | null;
  iterations: IterationEvent[];
  running: boolean;
  phase: StagePhase;
  rotationMode: RotationMode;
};

function historyEntries(preAlign: PreAlignSummary | null, iterations: IterationEvent[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  if (preAlign?.historySnapshot) {
    entries.push({
      key: 'pre-align',
      label: 'Pre-alignment',
      detail: 'initial matrix',
      status: 'initial',
      hitBoundary: false,
      snapshot: preAlign.historySnapshot,
    });
  }
  for (const iteration of iterations) {
    if (!iteration.historySnapshot) continue;
    entries.push({
      key: `iteration-${iteration.n}`,
      label: historyStepLabel(iteration),
      detail: historyDeltaLabel(iteration),
      decision: historyDecisionLabel(iteration),
      protection: fixedFrameLabel(iteration),
      rejection: rejectionLabel(iteration),
      status: iteration.accepted === false ? 'rejected' : 'accepted',
      hitBoundary: iteration.hitBoundary,
      snapshot: iteration.historySnapshot,
    });
  }
  return entries;
}

export function HistoryTab({ preAlign, iterations, running, phase, rotationMode }: HistoryTabProps) {
  const [view, setView] = useState<HistoryView>('gray');
  const entries = historyEntries(preAlign, iterations);
  const views: [HistoryView, string][] = [
    ['gray', preAlign?.preprocessMode === 'clahe' ? 'CLAHE' : 'Grey'],
    ['edge', 'Edges'],
    ['overlay', 'Overlay'],
    ['difference', 'Difference'],
  ];

  return (
    <>
      <div className="section roi-history-controls">
        <div className="section-h">
          <span>ROI history <InfoTip>{rotationMode === 'ring' ? HELP.historyRing : HELP.historyMoving}{view === 'edge' ? ' Edges are contrast-stretched for visibility.' : ''}</InfoTip></span>
          <span className="h-meta">{entries.length} frames</span>
        </div>
        <Segmented<HistoryView> aria-label="ROI history view" value={view} onChange={setView} fill
          options={views.map(([value, label]) => ({ value, label }))} />
      </div>

      <div className="roi-history-list">
        {entries.length === 0 && (
          <div className="roi-history-empty">
            {running
              ? 'Waiting for the first ROI frame…'
              : phase === 'placing' || phase === 'locked'
                ? 'Place the reference points to create ROI history.'
                : 'Run alignment to capture ROI history.'}
          </div>
        )}
        {entries.map((entry) => (
          <HistoryFrameCard key={entry.key} entry={entry} view={view} />
        ))}
      </div>
    </>
  );
}

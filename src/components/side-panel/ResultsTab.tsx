import { CircleCheck, Download, FileImage, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import { Tooltip } from '@/components/common/Tooltip';
import { HELP } from '@/components/helpText';
import { alignmentStatus } from '@/lib/format';
import { stageDef, type StageId } from '@/lib/stages';
import { stageBase, stagePhase, visibleStages, type WorkflowState } from '@/lib/workflow';
import { ScoreChart } from './ScoreChart';
import { StatCard } from './StatCard';

export type ResultsExports = {
  exporting: string | null;
  onExportResults: () => void;
  onExportAllImages: () => void;
  onExportImage: (stage: StageId) => void;
};

type ResultsTabProps = {
  workflow: WorkflowState;
  running: boolean;
  exports: ResultsExports;
};

const PHASE_LABELS = {
  locked: 'after the cranial base',
  placing: 'reference points pending',
  ready: 'not run yet',
  running: 'aligning…',
  done: '',
} as const;

// Rotation, RP1B2 translation, score curve and alignment score of every
// superimposition, with the exports.
export function ResultsTab({ workflow, running, exports }: ResultsTabProps) {
  const stages = visibleStages(workflow);
  const doneCount = stages.filter((id) => workflow.stages[id].result).length;
  const busy = running || !!exports.exporting;
  return (
    <>
      <div className="section">
        <div className="section-h"><span>Summary</span><span className="h-meta">{doneCount} / {stages.length} done</span></div>
        <div className="button-row">
          <button className="btn" disabled={!doneCount || busy} onClick={exports.onExportResults}>
            <FileSpreadsheet size={15} />{exports.exporting === 'results' ? 'Exporting…' : 'Export results (CSV)'}
          </button>
          <button className="btn" disabled={!doneCount || busy} onClick={exports.onExportAllImages}>
            <FileImage size={15} />{exports.exporting === 'images' ? 'Exporting…' : 'Aligned images'}
          </button>
        </div>
      </div>
      <div className="section stage-results">
        {stages.map((id) => {
          const def = stageDef(id);
          const stage = workflow.stages[id];
          const result = stage.result;
          const scores = [stage.preAlignEvent?.blendedNcc, ...stage.iterations.map((it) => it.score)].filter(Number.isFinite);
          const status = alignmentStatus(result);
          return (
            <article key={id} className={`stage-result ${result ? '' : 'pending'}`}>
              <header className="stage-result-h">
                <span className="stage-result-name">
                  {result && (
                    <Tooltip content={status.label}>
                      {status.warn ? <TriangleAlert size={14} className="warn" /> : <CircleCheck size={14} className="ok" />}
                    </Tooltip>
                  )}
                  {def.name}
                </span>
                {result
                  ? <span className="h-meta">vs {stageBase(workflow, id) ? 'cranial base' : 'T1'}</span>
                  : <span className="h-meta">{PHASE_LABELS[stagePhase(workflow, id)]}</span>}
                {result && (
                  <Tooltip content="Export the aligned T2 of this superimposition (PNG)">
                    <button className="icon-btn" aria-label={`Export aligned T2 · ${def.name}`} disabled={busy} onClick={() => exports.onExportImage(id)}>
                      <Download size={15} />
                    </button>
                  </Tooltip>
                )}
              </header>
              {result && (
                <>
                  <div className="results-grid dense">
                    <StatCard label="Rotation" value={result.totalAngle.toFixed(2)} unit="°" />
                    <StatCard label="Translation RP1B2 x / y" value={`${result.rp1b2DxMm.toFixed(2)}, ${result.rp1b2DyMm.toFixed(2)}`} unit="mm" wide />
                    <StatCard label="Score" value={result.score.toFixed(4)} tone="ok" info={HELP.score} />
                  </div>
                  {scores.length > 1 && <ScoreChart scores={scores} compact />}
                </>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

import { Check, TriangleAlert, X } from 'lucide-react';
import { InfoTip, Tooltip } from '@/components/common/Tooltip';
import { HELP } from '@/components/helpText';
import { alignmentStatus, formatScore, formatSigned } from '@/lib/format';
import type { StagePhase } from '@/lib/workflow';
import type { AlignmentResult, IterationEvent, PreAlignSummary } from '@/types';
import { fixedFrameLabel, iterationStepName, rejectionLabel } from './iterationLabels';
import { ScoreChart } from './ScoreChart';

type IterationsTabProps = {
  iterations: IterationEvent[];
  preAlign: PreAlignSummary | null;
  phase: StagePhase;
  running: boolean;
  results: AlignmentResult | null;
};

function StepStatus({ iteration }: { iteration: IterationEvent }) {
  const rejection = rejectionLabel(iteration);
  const tooltip = (
    <>
      <div className="tooltip-title">{iteration.accepted ? 'Accepted' : 'Rejected'}{iteration.hitBoundary ? ' · search limit' : ''}</div>
      {rejection && <div>{rejection}</div>}
      <div className="mono">{fixedFrameLabel(iteration)}</div>
    </>
  );
  const icon = iteration.hitBoundary
    ? <TriangleAlert size={13} className="warn" />
    : iteration.accepted ? <Check size={13} className="ok" /> : <X size={13} className="bad" />;
  return <Tooltip content={tooltip} placement="left">{icon}</Tooltip>;
}

export function IterationsTab({ iterations, preAlign, phase, running, results }: IterationsTabProps) {
  const initialScores = Number.isFinite(preAlign?.blendedNcc) ? [preAlign.blendedNcc] : [];
  const selectedInitial = results?.terminationReason === 'pre-alignment-only';
  const scores = [...initialScores, ...iterations.map(it => it.score),
    ...(selectedInitial && iterations.length ? [results.score] : [])].filter(Number.isFinite);
  const latest = results ?? iterations.at(-1) ?? preAlign;
  const objectiveScores = iterations.map((iteration) => iteration.candidateScore).filter(Number.isFinite);
  const finiteScores = objectiveScores.length ? objectiveScores : scores;
  const minScore = finiteScores.length ? Math.min(...finiteScores) : -1;
  const maxScore = finiteScores.length ? Math.max(...finiteScores) : 1;
  const scoreSpan = Math.max(0.001, maxScore - minScore);
  const status = alignmentStatus(results);

  return (
    <>
      <div className="section">
        <div className="section-h">
          <span>Score <InfoTip>{HELP.score}</InfoTip></span>
          {phase === 'done' && <span className={`status-text ${status.warn ? 'warn' : 'ok'}`}>{status.label}</span>}
          {running && <span className="status-text warn">running…</span>}
        </div>
        <ScoreChart scores={scores} />
        <div className="kv" style={{marginTop: 10}}>
          <div className="k">Initial → current</div>
          <div className="v">{formatScore(preAlign?.blendedNcc)} → {formatScore(latest?.blendedNcc)}</div>
          <div className="k">Grayscale / edge NCC</div>
          <div className="v">{formatScore(latest?.grayNcc)} / {formatScore(latest?.edgeNcc)}</div>
        </div>
        {selectedInitial && <p className="hint">Pre-alignment selected; the log keeps the earlier steps.</p>}
      </div>

      <div className="section flush">
        <div className="section-h"><span>Log</span><span className="h-meta">{iterations.length} steps</span></div>
        <div className="iter-row head">
          <div>#</div>
          <div>Step</div>
          <div className="num">Δ</div>
          <div className="num">Score</div>
          <div />
        </div>
        {iterations.length === 0 && (
          <div className="empty-note">
            {selectedInitial ? 'Pre-alignment only, no refinement steps' : phase !== 'running' ? 'No steps yet' : 'Waiting for the first step…'}
          </div>
        )}
        {iterations.map((it, idx) => {
          const isLast = idx === iterations.length - 1;
          const angleStr = `${formatSigned(it.dAngle, 2)}°`;
          const shiftStr = `${formatSigned(it.dx, 2)}, ${formatSigned(it.dy, 2)}`;
          const delta = it.kind === 'ring' ? <>{angleStr}<br />{shiftStr}</> : it.kind === 'rot' ? angleStr : shiftStr;
          const scorePct = Math.max(0, Math.min(1, (it.candidateScore - minScore) / scoreSpan));
          return (
            <div key={idx} className={`iter-row ${isLast && running ? 'current' : ''} ${it.accepted ? '' : 'rejected'}`}>
              <div className="n">{it.n}</div>
              <div>{iterationStepName(it)}</div>
              <div className="num">{delta}</div>
              <div className="num">
                {it.candidateScore.toFixed(4)}
                <div className="score-bar"><div style={{width: `${scorePct * 100}%`}} /></div>
              </div>
              <div className="iter-status"><StepStatus iteration={it} /></div>
            </div>
          );
        })}
      </div>
    </>
  );
}

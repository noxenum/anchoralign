import { ArrowRight, Play, X } from 'lucide-react';
import { Prompt } from '@/components/common/Prompt';
import { InfoTip } from '@/components/common/Tooltip';
import { HELP } from '@/components/helpText';
import { AUTO_RUN_DELAY_MS } from '@/constants';
import { stageDef, type LandmarkMeta, type StageDef, type StageId } from '@/lib/stages';
import type { StagePhase } from '@/lib/workflow';
import type { AlignmentResult, IterationEvent, PreAlignSummary, RotationMode } from '@/types';

type ViewerPromptsProps = {
  stage: StageDef;
  phase: StagePhase;
  hasImages: boolean;
  hasImageGeometry: boolean;
  activeLandmark: LandmarkMeta;
  error: string | null;
  preAlign: PreAlignSummary | null;
  iterations: IterationEvent[];
  result: AlignmentResult | null;
  rotationMode: RotationMode;
  autoRunArmed: boolean;
  nextStage: StageId | null;
  allDone: boolean;
  onRunNow: () => void;
  onCancelAutoRun: () => void;
  onContinue: (stage: StageId) => void;
};

function runningStepLabel(kind: IterationEvent['kind'] | undefined, rotationMode: RotationMode) {
  if (kind === 'ring' || (!kind && rotationMode === 'ring')) return 'ring segment';
  return kind === 'rot' ? 'rotating ROI₂' : 'translating ROI₁';
}

// Hint for the current workflow step, shown over the image area.
export function ViewerPrompts({
  stage, phase, hasImages, hasImageGeometry, activeLandmark, error, preAlign, iterations, result,
  rotationMode, autoRunArmed, nextStage, allDone, onRunNow, onCancelAutoRun, onContinue,
}: ViewerPromptsProps) {
  const lastIteration = iterations.at(-1);

  if (!hasImages) {
    return <Prompt tone="info" title="Load T1 and T2 images" sub="Click or drop an image into each pane, or use T1 / T2 at the top" />;
  }
  if (!hasImageGeometry) {
    return <Prompt tone="info" title="Reading scan geometry…" />;
  }
  if (error) {
    return <Prompt tone="bad" title={`${stage.name}: alignment could not run`} sub={error} />;
  }
  if (phase === 'placing') {
    const onAlignedT2 = activeLandmark.image === 't2' && stage.id !== 'cranialBase';
    return (
      <Prompt
        tone={activeLandmark.key}
        title={<>Click the <b>{activeLandmark.name.toLowerCase()}</b> on {activeLandmark.image.toUpperCase()}</>}
        sub={<>{stage.name} · {activeLandmark.code}{onAlignedT2 && <> · aligned T2 <InfoTip>{HELP.chained}</InfoTip></>}</>}
      />
    );
  }
  if (phase === 'ready' && preAlign && autoRunArmed) {
    return (
      <Prompt
        tone="info"
        title={<>Starting the {stage.name.toLowerCase()} alignment… <InfoTip>{HELP.autoRun}</InfoTip></>}
        sub={<span className="autorun-bar" style={{ animationDuration: `${AUTO_RUN_DELAY_MS}ms` }} />}
        actions={<>
          <button className="btn primary sm" onClick={onRunNow}><Play size={13} />Run now</button>
          <button className="btn ghost sm" onClick={onCancelAutoRun}><X size={13} />Cancel</button>
        </>}
      />
    );
  }
  if (phase === 'ready' && preAlign) {
    return (
      <Prompt
        tone="info"
        title={`${stage.name} pre-aligned`}
        sub={`Δ ${preAlign.angle.toFixed(2)}° · ${Math.hypot(preAlign.tx_mm, preAlign.ty_mm).toFixed(2)} mm`}
        actions={<button className="btn primary sm" onClick={onRunNow}><Play size={13} />Run alignment</button>}
      />
    );
  }
  if (phase === 'running') {
    return (
      <Prompt
        tone="info"
        title={`Aligning the ${stage.name.toLowerCase()}…`}
        sub={`Step ${iterations.length} · ${runningStepLabel(lastIteration?.kind, rotationMode)} · ${lastIteration?.candidateScore?.toFixed(4) ?? '—'}`}
      />
    );
  }
  if (phase === 'done' && allDone && !nextStage) {
    return <Prompt tone="ok" title="All superimpositions done" sub="Results and exports are in the Results tab" />;
  }
  if (phase === 'done' && nextStage && result) {
    return (
      <Prompt
        tone="ok"
        title={`${stage.name} aligned`}
        sub={`${result.totalAngle.toFixed(2)}° · ${result.rp1b2DxMm.toFixed(2)}, ${result.rp1b2DyMm.toFixed(2)} mm`}
        actions={
          <button className="btn primary sm" onClick={() => onContinue(nextStage)}>
            Continue with the {stageDef(nextStage).name.toLowerCase()}<ArrowRight size={13} />
          </button>
        }
      />
    );
  }
  return null;
}

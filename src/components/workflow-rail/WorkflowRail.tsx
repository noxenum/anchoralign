import { Check, CircleCheck, Layers, LoaderCircle, Lock, Target, TriangleAlert, X } from 'lucide-react';
import { Segmented } from '@/components/common/Segmented';
import { Select } from '@/components/common/Select';
import { Tooltip } from '@/components/common/Tooltip';
import { alignmentStatus } from '@/lib/format';
import { activeLandmark, countPlaced, isPlaced } from '@/lib/landmarks';
import { STAGE_DEFS, stageDef, stageLandmarks, type StageId } from '@/lib/stages';
import { stagePhase, visibleStages, type WorkflowMode, type WorkflowState } from '@/lib/workflow';

type WorkflowRailProps = {
  workflow: WorkflowState;
  running: boolean;
  onSetMode: (mode: WorkflowMode) => void;
  onSetActiveStage: (id: StageId) => void;
  onSelectLandmark: (stage: StageId, id: string) => void;
  onClearLandmark: (stage: StageId, id: string) => void;
};

const MODE_OPTIONS = [
  { value: 'guided', label: 'Three-stage', icon: <Layers size={14} />, tooltip: 'Cranial base, then mandible and maxilla on the aligned T2' },
  { value: 'single', label: 'Single', icon: <Target size={14} />, tooltip: 'One superimposition on its own' },
] as const;

const STAGE_OPTIONS = STAGE_DEFS.map((def) => ({ value: def.id, label: def.name }));

function StageStatus({ workflow, id }: { workflow: WorkflowState; id: StageId }) {
  const stage = workflow.stages[id];
  const def = stageDef(id);
  switch (stagePhase(workflow, id)) {
    case 'locked':
      return <Tooltip content="Available once the cranial base is aligned"><Lock size={13} className="stage-status" /></Tooltip>;
    case 'running':
      return <LoaderCircle size={13} className="stage-status spin" />;
    case 'done': {
      const status = alignmentStatus(stage.result);
      return (
        <Tooltip content={`${status.label} · ${stage.result.totalAngle.toFixed(2)}°`}>
          <span className={`stage-status ${status.warn ? 'warn' : 'ok'}`}>
            {status.warn ? <TriangleAlert size={13} /> : <CircleCheck size={13} />}
            {stage.result.totalAngle.toFixed(2)}°
          </span>
        </Tooltip>
      );
    }
    default:
      if (stage.error) return <Tooltip content={stage.error}><TriangleAlert size={13} className="stage-status bad" /></Tooltip>;
      return <span className="stage-status">{countPlaced(def, stage.points)}/{stageLandmarks(def).length}</span>;
  }
}

// The reference points of each superimposition as a numbered workflow.
export function WorkflowRail({ workflow, running, onSetMode, onSetActiveStage, onSelectLandmark, onClearLandmark }: WorkflowRailProps) {
  let stepNumber = 0;

  return (
    <nav className="rail">
      <div className="rail-mode">
        <Segmented aria-label="Workflow mode" value={workflow.mode} options={MODE_OPTIONS} onChange={onSetMode} disabled={running} fill />
        {workflow.mode === 'single' && (
          <Select aria-label="Superimposition" value={workflow.activeStage} options={STAGE_OPTIONS}
            onChange={onSetActiveStage} disabled={running} />
        )}
      </div>
      <div className="rail-steps">
        {visibleStages(workflow).map((id) => {
          const def = stageDef(id);
          const stage = workflow.stages[id];
          const phase = stagePhase(workflow, id);
          const locked = phase === 'locked';
          const isActiveStage = id === workflow.activeStage;
          const next = phase === 'placing' && isActiveStage ? activeLandmark(def, stage.points, stage.selectedId) : null;
          return (
            <section key={id} className={`rail-group ${isActiveStage ? 'active' : ''} ${locked ? 'locked' : ''}`}>
              <button
                type="button"
                className="rail-stage"
                disabled={locked || running}
                onClick={() => onSetActiveStage(id)}
              >
                <span className="rail-stage-name">{def.name}</span>
                <StageStatus workflow={workflow} id={id} />
              </button>
              {stageLandmarks(def).map((meta) => {
                stepNumber += 1;
                const placed = isPlaced(stage.points, meta);
                const current = next?.id === meta.id;
                return (
                  <div
                    key={meta.id}
                    role="button"
                    tabIndex={locked || running ? -1 : 0}
                    aria-disabled={locked || running}
                    className={`rail-step ${current ? 'active' : ''} ${placed ? 'done' : ''}`}
                    onClick={() => !locked && !running && onSelectLandmark(id, meta.id)}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && !locked && !running) {
                        event.preventDefault();
                        onSelectLandmark(id, meta.id);
                      }
                    }}
                  >
                    <span className="step-marker">{placed ? <Check size={12} strokeWidth={3} /> : stepNumber}</span>
                    <Tooltip content={`${meta.code}${placed ? ' · click to place again' : ''}`} placement="right">
                      <span className="step-name">{meta.name}</span>
                    </Tooltip>
                    <span className={`step-image ${meta.image}`}>{meta.image.toUpperCase()}</span>
                    {placed && !locked && (
                      <button
                        type="button"
                        className="icon-btn step-clear"
                        aria-label={`Clear ${meta.name} on ${meta.image.toUpperCase()}`}
                        disabled={running}
                        onClick={(event) => { event.stopPropagation(); onClearLandmark(id, meta.id); }}
                      ><X size={12} /></button>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </nav>
  );
}

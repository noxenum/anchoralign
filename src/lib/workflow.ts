import { EMPTY_LANDMARKS, isComplete, isPlaced, withPoint } from '@/lib/landmarks';
import { STAGE_IDS, stageDef, stageLandmarks, type AlignmentParams, type StageId } from '@/lib/stages';
import type { Affine6, AlignmentResult, ImageKey, IterationEvent, LandmarkDraft, LandmarkKey, Point, PreAlignEvent } from '@/types';

// Three-stage mode chains mandible and maxilla onto the cranial base; single
// mode runs one superimposition on its own.
export type WorkflowMode = 'guided' | 'single';

export type StageState = {
  // T1 points in T1 pixels, T2 points in native T2 pixels.
  points: LandmarkDraft;
  selectedId: string | null;
  params: AlignmentParams;
  // Only events of this run are accepted.
  runId: number | null;
  running: boolean;
  iterations: IterationEvent[];
  preAlignEvent: PreAlignEvent | null;
  // Matrices map the stage's input frame onto T1 (see stageBase).
  currentMatrix: Affine6 | null;
  result: AlignmentResult | null;
  error: string | null;
  // Set when the user stops the automatic start; cleared by any change.
  autoRunCancelled: boolean;
};

export type WorkflowState = {
  mode: WorkflowMode;
  activeStage: StageId;
  stages: Record<StageId, StageState>;
};

export type StagePhase = 'locked' | 'placing' | 'ready' | 'running' | 'done';

export type WorkflowAction =
  | { type: 'reset' }
  | { type: 'setMode'; mode: WorkflowMode; stage: StageId }
  | { type: 'setActive'; stageId: StageId }
  | { type: 'place'; stageId: StageId; image: ImageKey; key: LandmarkKey; point: Point }
  | { type: 'select'; stageId: StageId; id: string }
  | { type: 'clear'; stageId: StageId; id: string }
  | { type: 'setParams'; stageId: StageId; params: Partial<AlignmentParams> }
  | { type: 'restoreDefaults'; stageId: StageId }
  | { type: 'clearRuns' }
  | { type: 'runStarted'; stageId: StageId; runId: number; initialMatrix: Affine6 }
  | { type: 'preAlign'; stageId: StageId; runId: number; event: PreAlignEvent }
  | { type: 'iteration'; stageId: StageId; runId: number; event: IterationEvent }
  | { type: 'done'; stageId: StageId; runId: number; result: AlignmentResult }
  | { type: 'failed'; stageId: StageId; runId: number; error: string }
  | { type: 'usePreAlignment'; stageId: StageId }
  | { type: 'cancelAutoRun'; stageId: StageId }
  | { type: 'setError'; stageId: StageId; error: string | null };

const EMPTY_RUN = {
  runId: null,
  running: false,
  iterations: [],
  preAlignEvent: null,
  currentMatrix: null,
  result: null,
  error: null,
  autoRunCancelled: false,
} satisfies Partial<StageState>;

function freshStage(id: StageId, params = stageDef(id).defaults): StageState {
  return { points: EMPTY_LANDMARKS, selectedId: null, params, ...EMPTY_RUN };
}

export function createWorkflow(mode: WorkflowMode, singleStage: StageId): WorkflowState {
  return {
    mode,
    activeStage: mode === 'guided' ? 'cranialBase' : singleStage,
    stages: Object.fromEntries(STAGE_IDS.map((id) => [id, freshStage(id)])) as Record<StageId, StageState>,
  };
}

// Stages built on this stage's result, which a change to it invalidates.
export function dependentStages(state: WorkflowState, id: StageId): StageId[] {
  return state.mode === 'guided' && id === 'cranialBase' ? ['mandible', 'maxilla'] : [];
}

// Stages shown in the workflow: all three in three-stage mode, else the chosen one.
export function visibleStages(state: WorkflowState): StageId[] {
  return state.mode === 'guided' ? [...STAGE_IDS] : [state.activeStage];
}

export function isLocked(state: WorkflowState, id: StageId): boolean {
  return state.mode === 'guided' && id !== 'cranialBase' && !state.stages.cranialBase.result;
}

export function stagePhase(state: WorkflowState, id: StageId): StagePhase {
  if (isLocked(state, id)) return 'locked';
  const stage = state.stages[id];
  if (stage.running) return 'running';
  if (stage.result) return 'done';
  return isComplete(stage.points) ? 'ready' : 'placing';
}

export function allDone(state: WorkflowState): boolean {
  return visibleStages(state).every((id) => !!state.stages[id].result);
}

// Transform from native T2 pixels into the stage's input frame: the cranial-base
// result for chained stages, otherwise null (native T2).
export function stageBase(state: WorkflowState, id: StageId): Affine6 | null {
  if (state.mode !== 'guided' || id === 'cranialBase') return null;
  return state.stages.cranialBase.result?.matrix ?? null;
}

function updateStage(state: WorkflowState, id: StageId, update: (stage: StageState) => StageState): WorkflowState {
  return { ...state, stages: { ...state.stages, [id]: update(state.stages[id]) } };
}

// Discards the run of a stage and of every stage that depends on it.
function clearRun(state: WorkflowState, id: StageId): WorkflowState {
  let next = updateStage(state, id, (stage) => ({ ...stage, ...EMPTY_RUN }));
  for (const dependent of dependentStages(state, id)) {
    next = updateStage(next, dependent, (stage) => ({ ...stage, ...EMPTY_RUN }));
  }
  return next;
}

function editPoints(state: WorkflowState, id: StageId, edit: (stage: StageState) => Partial<StageState>): WorkflowState {
  return clearRun(updateStage(state, id, (stage) => ({ ...stage, ...edit(stage) })), id);
}

// Applies an event of a run, unless the run has been superseded.
function runEvent(state: WorkflowState, id: StageId, runId: number, update: (stage: StageState) => Partial<StageState>): WorkflowState {
  if (state.stages[id].runId !== runId) return state;
  return updateStage(state, id, (stage) => ({ ...stage, ...update(stage) }));
}

export function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'reset': {
      let next = state;
      for (const id of STAGE_IDS) next = updateStage(next, id, (stage) => freshStage(id, stage.params));
      return { ...next, activeStage: state.mode === 'guided' ? 'cranialBase' : state.activeStage };
    }
    case 'setMode':
      return workflowReducer({ ...state, mode: action.mode, activeStage: action.stage }, { type: 'reset' });
    case 'setActive':
      return isLocked(state, action.stageId) ? state : { ...state, activeStage: action.stageId };
    case 'place': {
      const def = stageDef(action.stageId);
      return editPoints(state, action.stageId, (stage) => ({
        points: withPoint(def, stage.points, action.image, action.key, action.point),
        selectedId: null,
      }));
    }
    case 'select': {
      const meta = stageLandmarks(stageDef(action.stageId)).find((m) => m.id === action.id);
      if (!meta) return state;
      // Selecting a placed landmark clears it so it can be placed again.
      const cleared = isPlaced(state.stages[action.stageId].points, meta);
      return editPoints({ ...state, activeStage: action.stageId }, action.stageId, (stage) => ({
        points: cleared ? withPoint(stageDef(action.stageId), stage.points, meta.image, meta.key, null) : stage.points,
        selectedId: action.id,
      }));
    }
    case 'clear': {
      const meta = stageLandmarks(stageDef(action.stageId)).find((m) => m.id === action.id);
      if (!meta) return state;
      return editPoints(state, action.stageId, (stage) => ({
        points: withPoint(stageDef(action.stageId), stage.points, meta.image, meta.key, null),
      }));
    }
    case 'setParams':
      return editPoints(state, action.stageId, (stage) => ({ params: { ...stage.params, ...action.params } }));
    case 'restoreDefaults':
      return editPoints(state, action.stageId, () => ({ params: stageDef(action.stageId).defaults }));
    case 'clearRuns': {
      let next = state;
      for (const id of STAGE_IDS) next = updateStage(next, id, (stage) => ({ ...stage, ...EMPTY_RUN }));
      return next;
    }
    case 'runStarted':
      return updateStage(clearRun(state, action.stageId), action.stageId, (stage) => ({
        ...stage,
        runId: action.runId,
        running: true,
        currentMatrix: action.initialMatrix,
      }));
    case 'preAlign':
      return runEvent(state, action.stageId, action.runId, () => ({
        preAlignEvent: action.event,
        currentMatrix: action.event.matrix,
      }));
    case 'iteration':
      return runEvent(state, action.stageId, action.runId, (stage) => ({
        iterations: [...stage.iterations, action.event],
        currentMatrix: action.event.matrix ?? stage.currentMatrix,
      }));
    case 'done':
      return runEvent(state, action.stageId, action.runId, () => ({
        running: false,
        result: action.result,
        currentMatrix: action.result.matrix,
      }));
    case 'failed':
      return runEvent(state, action.stageId, action.runId, () => ({ running: false, error: action.error }));
    case 'usePreAlignment': {
      const initial = state.stages[action.stageId].preAlignEvent?.initialResult;
      if (!initial) return state;
      let next = state;
      for (const dependent of dependentStages(state, action.stageId)) {
        next = updateStage(next, dependent, (stage) => ({ ...stage, ...EMPTY_RUN }));
      }
      return updateStage(next, action.stageId, (stage) => ({ ...stage, result: initial, currentMatrix: initial.matrix }));
    }
    case 'cancelAutoRun':
      return updateStage(state, action.stageId, (stage) => ({ ...stage, autoRunCancelled: true }));
    case 'setError':
      return updateStage(state, action.stageId, (stage) => ({ ...stage, error: action.error }));
  }
}

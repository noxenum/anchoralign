import { describe, expect, it } from 'vitest';
import { stageDef } from './stages';
import {
  allDone, createWorkflow, isLocked, stageBase, stagePhase, visibleStages, workflowReducer,
  type WorkflowAction, type WorkflowState,
} from './workflow';
import type { AlignmentResult, PreAlignEvent } from '@/types';

const p = { x: 1, y: 2 };
const result = (matrix = [1, 0, 5, 0, 1, 0]) => ({ matrix }) as unknown as AlignmentResult;

function apply(state: WorkflowState, ...actions: WorkflowAction[]) {
  return actions.reduce(workflowReducer, state);
}

function placeAll(state: WorkflowState, stageId: 'cranialBase' | 'mandible'): WorkflowState {
  return apply(state,
    { type: 'place', stageId, image: 't1', key: 'rp1', point: p },
    { type: 'place', stageId, image: 't2', key: 'rp1', point: p },
    { type: 'place', stageId, image: 't1', key: 'rp2', point: p },
    { type: 'place', stageId, image: 't2', key: 'rp2', point: p });
}

function alignCranialBase(state: WorkflowState): WorkflowState {
  return apply(placeAll(state, 'cranialBase'),
    { type: 'runStarted', stageId: 'cranialBase', runId: 1, initialMatrix: [1, 0, 0, 0, 1, 0] },
    { type: 'done', stageId: 'cranialBase', runId: 1, result: result() });
}

describe('three-stage workflow', () => {
  it('starts on the cranial base with each stage at its standard settings', () => {
    const state = createWorkflow('guided', 'maxilla');
    expect(state.activeStage).toBe('cranialBase');
    expect(visibleStages(state)).toEqual(['cranialBase', 'mandible', 'maxilla']);
    expect(state.stages.mandible.params).toEqual(stageDef('mandible').defaults);
    expect(state.stages.maxilla.params.roi1Mm).toBe(20);
  });

  it('locks mandible and maxilla until the cranial base is aligned', () => {
    let state = createWorkflow('guided', 'cranialBase');
    expect(stagePhase(state, 'mandible')).toBe('locked');
    expect(workflowReducer(state, { type: 'setActive', stageId: 'mandible' }).activeStage).toBe('cranialBase');
    state = placeAll(state, 'cranialBase');
    expect(stagePhase(state, 'cranialBase')).toBe('ready');
    state = alignCranialBase(state);
    expect(stagePhase(state, 'cranialBase')).toBe('done');
    expect(stagePhase(state, 'mandible')).toBe('placing');
    expect(stageBase(state, 'mandible')).toEqual([1, 0, 5, 0, 1, 0]);
    expect(stageBase(state, 'cranialBase')).toBeNull();
  });

  it('invalidates mandible and maxilla results when the cranial base changes, keeping their points', () => {
    let state = alignCranialBase(createWorkflow('guided', 'cranialBase'));
    state = apply(placeAll(state, 'mandible'),
      { type: 'runStarted', stageId: 'mandible', runId: 2, initialMatrix: [1, 0, 0, 0, 1, 0] },
      { type: 'done', stageId: 'mandible', runId: 2, result: result() });
    expect(state.stages.mandible.result).not.toBeNull();
    state = workflowReducer(state, { type: 'setParams', stageId: 'cranialBase', params: { roi1Mm: 12 } });
    expect(state.stages.cranialBase.result).toBeNull();
    expect(state.stages.mandible.result).toBeNull();
    expect(state.stages.mandible.points.t2.rp1).toEqual(p);
    expect(isLocked(state, 'mandible')).toBe(true);
  });

  it('lets a locked stage be configured without touching the active stage', () => {
    let state = workflowReducer(createWorkflow('guided', 'cranialBase'), { type: 'setParams', stageId: 'mandible', params: { roi1Mm: 24 } });
    expect(isLocked(state, 'mandible')).toBe(true);
    expect(state.activeStage).toBe('cranialBase');
    expect(state.stages.mandible.params.roi1Mm).toBe(24);
    expect(state.stages.cranialBase.params).toEqual(stageDef('cranialBase').defaults);
    state = workflowReducer(state, { type: 'restoreDefaults', stageId: 'mandible' });
    expect(state.stages.mandible.params).toEqual(stageDef('mandible').defaults);
  });

  it('keeps the cranial base result when another stage is reconfigured', () => {
    let state = alignCranialBase(createWorkflow('guided', 'cranialBase'));
    state = workflowReducer(state, { type: 'setParams', stageId: 'maxilla', params: { roi1Mm: 16 } });
    expect(state.stages.cranialBase.result).not.toBeNull();
    expect(state.stages.maxilla.params.roi1Mm).toBe(16);
  });

  it('ignores events of a superseded run', () => {
    let state = placeAll(createWorkflow('guided', 'cranialBase'), 'cranialBase');
    state = apply(state,
      { type: 'runStarted', stageId: 'cranialBase', runId: 1, initialMatrix: [1, 0, 0, 0, 1, 0] },
      { type: 'runStarted', stageId: 'cranialBase', runId: 2, initialMatrix: [1, 0, 0, 0, 1, 0] },
      { type: 'done', stageId: 'cranialBase', runId: 1, result: result() });
    expect(state.stages.cranialBase.running).toBe(true);
    expect(state.stages.cranialBase.result).toBeNull();
  });

  it('re-arms the automatic start after any change', () => {
    let state = placeAll(createWorkflow('guided', 'cranialBase'), 'cranialBase');
    state = workflowReducer(state, { type: 'cancelAutoRun', stageId: 'cranialBase' });
    expect(state.stages.cranialBase.autoRunCancelled).toBe(true);
    state = workflowReducer(state, { type: 'select', stageId: 'cranialBase', id: 'cranialBase:rp2-t2' });
    expect(state.stages.cranialBase.autoRunCancelled).toBe(false);
    expect(state.stages.cranialBase.points.t2.rp2).toBeNull();
  });

  it('uses the scored pre-alignment as result', () => {
    let state = placeAll(createWorkflow('guided', 'cranialBase'), 'cranialBase');
    const initialResult = result([1, 0, 2, 0, 1, 0]);
    state = apply(state,
      { type: 'runStarted', stageId: 'cranialBase', runId: 1, initialMatrix: [1, 0, 0, 0, 1, 0] },
      { type: 'preAlign', stageId: 'cranialBase', runId: 1, event: { initialResult, matrix: initialResult.matrix } as PreAlignEvent },
      { type: 'failed', stageId: 'cranialBase', runId: 1, error: 'stopped' },
      { type: 'usePreAlignment', stageId: 'cranialBase' });
    expect(state.stages.cranialBase.result).toBe(initialResult);
  });
});

describe('single mode', () => {
  it('runs one stage on its own, without a cranial-base input', () => {
    let state = createWorkflow('single', 'mandible');
    expect(visibleStages(state)).toEqual(['mandible']);
    expect(stagePhase(state, 'mandible')).toBe('placing');
    expect(stageBase(state, 'mandible')).toBeNull();
    state = apply(placeAll(state, 'mandible'),
      { type: 'runStarted', stageId: 'mandible', runId: 1, initialMatrix: [1, 0, 0, 0, 1, 0] },
      { type: 'done', stageId: 'mandible', runId: 1, result: result() });
    expect(allDone(state)).toBe(true);
  });

  it('resets everything when switching modes', () => {
    const state = apply(alignCranialBase(createWorkflow('guided', 'cranialBase')),
      { type: 'setMode', mode: 'single', stage: 'maxilla' });
    expect(state.activeStage).toBe('maxilla');
    expect(state.stages.cranialBase.result).toBeNull();
    expect(state.stages.cranialBase.points.t1.rp1).toBeNull();
  });
});

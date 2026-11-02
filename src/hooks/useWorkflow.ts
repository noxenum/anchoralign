import { useReducer, useRef } from 'react';
import type { AlignRequest, CephEngine } from '@/engine/engineClient';
import type { StageId } from '@/lib/stages';
import { createWorkflow, workflowReducer, type WorkflowMode } from '@/lib/workflow';
import type { Affine6 } from '@/types';

// Workflow state (landmarks, parameters and runs of every stage) and the
// action that runs one stage's alignment in the worker.
export function useWorkflow(mode: WorkflowMode, singleStage: StageId) {
  const [state, dispatch] = useReducer(workflowReducer, undefined, () => createWorkflow(mode, singleStage));
  const nextRunId = useRef(0);

  const run = async (
    engine: CephEngine,
    imagesLoaded: Promise<unknown>,
    stageId: StageId,
    request: AlignRequest,
    initialMatrix: Affine6,
  ) => {
    const runId = ++nextRunId.current;
    dispatch({ type: 'runStarted', stageId, runId, initialMatrix });
    try {
      await imagesLoaded;
      const result = await engine.align(request, {
        onPreAlign: (event) => dispatch({ type: 'preAlign', stageId, runId, event }),
        onIteration: (event) => dispatch({ type: 'iteration', stageId, runId, event }),
      });
      dispatch({ type: 'done', stageId, runId, result });
    } catch (err) {
      console.error('Alignment failed', err);
      dispatch({ type: 'failed', stageId, runId, error: alignmentErrorMessage(err) });
    }
  };

  return { state, dispatch, run };
}

function alignmentErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/fixed T1 ROI extends outside/.test(message)) {
    return 'The selected ROI extends outside image 1. Reduce its size or adjust the landmark.';
  }
  if (/Moving T2 ROI extends outside|valid ROI candidates|Pre-alignment has no fully valid ROI/.test(message)) {
    return 'The selected ROI extends outside image 2 during matching. Reduce its size or adjust the landmark.';
  }
  return message;
}

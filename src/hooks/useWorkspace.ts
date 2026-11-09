import { useMemo, useState } from 'react';
import { FALLBACK_IMAGE_SIZE } from '@/components/viewer/CephPane';
import { AUTO_RUN_DELAY_MS, ROT_RANGE_DEG, TR_RANGE_MM } from '@/constants';
import {
  computePreAlignMatrix, createRp2B2PlacementGuide, IDENTITY, mul23, preAlignGeometry, transformDraftPair,
} from '@/lib/geometry';
import {
  calibrationWarnings, formatScale, IMAGE_KEYS, scaledSize, sourceLabel, type PixelScale,
} from '@/lib/calibration';
import { baseName, downloadBlob, exportAlignedImage } from '@/lib/imageExport';
import { readFileResolution } from '@/lib/imageResolution';
import { activeLandmark, countPlaced, isComplete } from '@/lib/landmarks';
import { resultsCsv } from '@/lib/resultsExport';
import { STAGE_IDS, roiConfig, stageDef, type AlignmentParams, type StageId } from '@/lib/stages';
import { allDone, stageBase, stagePhase, visibleStages, type WorkflowMode, type WorkflowState } from '@/lib/workflow';
import { useAutoRun } from './useAutoRun';
import { useCalibration } from './useCalibration';
import { useEngine } from './useEngine';
import { useImageLoader } from './useImageLoader';
import { useSettings } from './useSettings';
import { useWorkflow } from './useWorkflow';
import type { Affine6, ImageKey, ImageSize, LandmarkDraft, LandmarkKey, Point, PreAlignSummary, PreprocessMode } from '@/types';

const FILE_SLUGS: Record<StageId, string> = { cranialBase: 'cranial-base', mandible: 'mandible', maxilla: 'maxilla' };


// Landmarks in the stage's frame: T1 at the alignment scale, T2 mapped through
// the stage base.
function framePoints(points: LandmarkDraft, t1Scale: Affine6 | null, base: Affine6 | null): LandmarkDraft {
  return {
    t1: t1Scale ? transformDraftPair(t1Scale, points.t1) : points.t1,
    t2: base ? transformDraftPair(base, points.t2) : points.t2,
  };
}

const compose = (a: Affine6 | null, b: Affine6 | null): Affine6 | null => (a && b ? mul23(a, b) : a ?? b);

// Native T2 -> the stage's T2 frame: rescaled to T1's scale, then, in chained
// stages, aligned on the cranial base.
function stageFrame(state: WorkflowState, id: StageId, t2Scale: Affine6 | null): Affine6 | null {
  return compose(stageBase(state, id), t2Scale);
}

// Transform from native T2 onto T1 of a stage's result: its own result after the
// frame it builds on.
function resultTransform(state: WorkflowState, id: StageId, t2Scale: Affine6 | null): Affine6 | null {
  const result = state.stages[id].result;
  if (!result) return null;
  return compose(result.matrix, stageFrame(state, id, t2Scale));
}

// Workspace state and actions: images, calibration and the superimposition
// workflow, plus the rules that tie them together (loading an image resets the
// session, a changed calibration discards all results, a complete stage starts
// automatically in three-stage mode).
export function useWorkspace() {
  const [settings, updateSettings] = useSettings();
  const engine = useEngine();
  const calibration = useCalibration();
  const { pxPerMm, t1Scale, t2Scale } = calibration;
  const imageLoader = useImageLoader(engine, t1Scale);
  const { images } = imageLoader;
  const workflow = useWorkflow(settings.workflowMode, settings.singleStage);
  const { state, dispatch } = workflow;
  const [preprocessMode, setPreprocessModeState] = useState<PreprocessMode>('raw');
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const stageId = state.activeStage;
  const def = stageDef(stageId);
  const stage = state.stages[stageId];
  const phase = stagePhase(state, stageId);
  const running = STAGE_IDS.some((id) => state.stages[id].running);
  const busy = running || !!exporting;
  const roi = useMemo(() => roiConfig(stage.params), [stage.params]);
  const base = stageFrame(state, stageId, t2Scale);
  const chained = !!stageBase(state, stageId);
  const effectivePreprocessMode: PreprocessMode = preprocessMode === 'clahe' && imageLoader.claheReady ? 'clahe' : 'raw';
  const isOverlayPhase = phase === 'ready' || phase === 'running' || phase === 'done';

  const displayImages = useMemo(() => {
    const useClahe = effectivePreprocessMode === 'clahe';
    return {
      t1: { ...images.t1, src: useClahe && images.t1.claheSrc ? images.t1.claheSrc : images.t1.src },
      t2: { ...images.t2, src: useClahe && images.t2.claheSrc ? images.t2.claheSrc : images.t2.src },
    };
  }, [images, effectivePreprocessMode]);

  const points = useMemo(() => framePoints(stage.points, t1Scale, base), [stage.points, t1Scale, base]);
  const { preAlignEvent } = stage;
  const preAlign = useMemo<PreAlignSummary | null>(() => {
    if (!isComplete(points)) return null;
    return {
      ...preAlignEvent,
      ...preAlignGeometry(points, pxPerMm),
      initialScore: preAlignEvent?.score,
      matrix: preAlignEvent?.matrix ?? computePreAlignMatrix(points),
    };
  }, [points, preAlignEvent, pxPerMm]);

  // Native T2 onto T1 as currently displayed: the stage input while placing,
  // then the pre-alignment, the running iteration or the result on top of it.
  const stageMatrix = isOverlayPhase ? stage.result?.matrix ?? stage.currentMatrix ?? preAlign?.matrix ?? null : null;
  const t2Transform = stageMatrix ? (base ? mul23(stageMatrix, base) : stageMatrix) : base;

  const active = activeLandmark(def, stage.points, stage.selectedId);
  const placementGuide = useMemo(() => (
    active.key === 'rp2' && active.image === 't2' ? createRp2B2PlacementGuide(points) : null
  ), [active.key, active.image, points]);

  const canRun = !!engine && imageLoader.hasImages && imageLoader.hasGeometry && !busy &&
    (phase === 'ready' || phase === 'done');
  const canExportT1 = !!(images.t1.src && images.t1.width && images.t1.height);

  // Native sizes, and T1 in the alignment frame.
  const nativeSize = (key: ImageKey): ImageSize => (
    images[key].width && images[key].height ? { width: images[key].width, height: images[key].height } : FALLBACK_IMAGE_SIZE
  );
  const t1FrameSize = scaledSize(nativeSize('t1'), t1Scale);
  // T2 is shown in T1's frame once transformed onto it; otherwise only rescaled.
  const t2FrameSize = isOverlayPhase || chained ? t1FrameSize : scaledSize(nativeSize('t2'), t2Scale);

  const resolutions = { t1: images.t1.resolution, t2: images.t2.resolution };
  const hasT1 = !!images.t1.src;
  const hasT2 = !!images.t2.src;
  const calibrationNotes = useMemo(
    () => calibrationWarnings(calibration.calibration, { t1: images.t1.resolution, t2: images.t2.resolution }, { t1: hasT1, t2: hasT2 }),
    [calibration.calibration, images.t1.resolution, images.t2.resolution, hasT1, hasT2],
  );
  // Calibration of each image as shown in the corner of its pane.
  const paneNotes = Object.fromEntries(IMAGE_KEYS.map((key) => {
    const scaled = key === 't1' ? t1Scale : t2Scale;
    const note = key === 't1' ? 'resampled' : 'rescaled to T1';
    return [key, `${formatScale(calibration.calibration[key].scale, settings.calibrationUnit)}${scaled ? ` · ${note}` : ''}`];
  })) as Record<ImageKey, string>;

  const runAlignment = (refinement = true) => {
    if (!canRun || !imageLoader.loaded.current || !isComplete(points)) return;
    const params = stage.params;
    workflow.run(engine, imageLoader.loaded.current, stageId, {
      scoreMode: params.scoreMode,
      rotationMode: params.rotationMode,
      refinement,
      points,
      roi,
      pxPerMm,
      stepDeg: params.stepDeg,
      stepMm: params.stepMm,
      rotRange: ROT_RANGE_DEG,
      trRange: TR_RANGE_MM,
      preprocessMode: effectivePreprocessMode,
      maxCycles: params.maxCycles,
      t2Base: base,
    }, computePreAlignMatrix(points));
  };

  const autoRunArmed = state.mode === 'guided' && phase === 'ready' && canRun && !stage.error && !stage.autoRunCancelled;
  useAutoRun(autoRunArmed, AUTO_RUN_DELAY_MS, () => runAlignment());

  // Next stage to work on in three-stage mode, once the active one is done.
  const nextStage = state.mode === 'guided' && phase === 'done'
    ? visibleStages(state).find((id) => id !== stageId && !state.stages[id].result) ?? null
    : null;

  // Shows the scored pre-alignment of the last run, or computes it without refinement.
  const usePreAlignment = () => {
    if (stage.preAlignEvent?.initialResult && !running) dispatch({ type: 'usePreAlignment', stageId });
    else runAlignment(false);
  };

  const withExport = async (key: string, task: () => Promise<void> | void) => {
    if (busy) return;
    setExporting(key);
    setExportError(null);
    try {
      await task();
    } catch (error) {
      setExportError(error.message || 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  // T1 defines the reference frame; it is exported with its original pixels,
  // resampled only when they are not square.
  const exportT1 = () => withExport('t1', () => {
    if (!canExportT1) return;
    return exportAlignedImage(images.t1.src, `${baseName(images.t1.name)}-T1.png`, t1Scale ?? IDENTITY, t1FrameSize, pxPerMm);
  });

  const exportAlignedT2 = (id: StageId) => withExport(id, () => {
    const matrix = resultTransform(state, id, t2Scale);
    if (!matrix || !images.t2.src || !canExportT1) return;
    return exportAlignedImage(images.t2.src, `${baseName(images.t2.name)}-aligned-${FILE_SLUGS[id]}.png`, matrix, t1FrameSize, pxPerMm);
  });

  const exportAllAlignedT2 = () => withExport('images', async () => {
    for (const id of visibleStages(state)) {
      const matrix = resultTransform(state, id, t2Scale);
      if (!matrix || !images.t2.src || !canExportT1) continue;
      await exportAlignedImage(images.t2.src, `${baseName(images.t2.name)}-aligned-${FILE_SLUGS[id]}.png`, matrix, t1FrameSize, pxPerMm);
    }
  });

  const exportResults = () => withExport('results', () => {
    const rows = visibleStages(state)
      .filter((id) => state.stages[id].result)
      .map((id) => ({
        stage: stageDef(id),
        reference: stageBase(state, id) ? 'cranial base' : 'T1',
        params: state.stages[id].params,
        result: state.stages[id].result,
      }));
    if (!rows.length) return;
    const csv = resultsCsv(rows, {
      t1Name: images.t1.name,
      t2Name: images.t2.name,
      pxPerMm,
      calibration: {
        t1: { scale: calibration.calibration.t1.scale, source: sourceLabel(calibration.calibration.t1.source) },
        t2: { scale: calibration.calibration.t2.scale, source: sourceLabel(calibration.calibration.t2.source) },
      },
      preprocessMode: effectivePreprocessMode,
      version: __APP_VERSION__,
      exportedAt: new Date(),
    });
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${baseName(images.t2.name)}-superimposition.csv`);
  });

  const resetSession = () => {
    setShowAnnotations(true);
    dispatch({ type: 'reset' });
  };

  const loadImageFile = async (key: ImageKey, file: File | undefined) => {
    if (busy || !file || !file.type.startsWith('image/')) return;
    const resolution = await readFileResolution(file);
    calibration.applyResolutions({
      t1: key === 't1' ? resolution : images.t1.resolution,
      t2: key === 't2' ? resolution : images.t2.resolution,
    });
    imageLoader.setImage(key, file, resolution);
    resetSession();
  };

  const removeImage = (key: ImageKey) => {
    if (busy || !images[key].src) return;
    calibration.applyResolutions({
      t1: key === 't1' ? null : images.t1.resolution,
      t2: key === 't2' ? null : images.t2.resolution,
    });
    imageLoader.clearImage(key);
    resetSession();
  };

  // Clicks arrive in native image pixels.
  const placeLandmark = (image: ImageKey, key: LandmarkKey, point: Point) => {
    if (!running) dispatch({ type: 'place', stageId, image, key, point });
  };

  const selectLandmark = (id: StageId, landmarkId: string) => {
    if (!running) dispatch({ type: 'select', stageId: id, id: landmarkId });
  };

  const clearLandmark = (id: StageId, landmarkId: string) => {
    if (!running) dispatch({ type: 'clear', stageId: id, id: landmarkId });
  };

  const setMode = (mode: WorkflowMode) => {
    if (running || mode === state.mode) return;
    updateSettings({ workflowMode: mode });
    setShowAnnotations(true);
    dispatch({ type: 'setMode', mode, stage: mode === 'guided' ? 'cranialBase' : settings.singleStage });
  };

  const setActiveStage = (id: StageId) => {
    if (running) return;
    if (state.mode === 'single') updateSettings({ singleStage: id });
    dispatch({ type: 'setActive', stageId: id });
  };

  return {
    settings,
    updateSettings,
    images,
    displayImages,
    hasImages: imageLoader.hasImages,
    hasImageGeometry: imageLoader.hasGeometry,
    claheReady: imageLoader.claheReady,
    calibration: calibration.calibration,
    pxPerMm,
    calibrationNotes,
    paneNotes,
    t1Scale,
    t1FrameSize,
    t2FrameSize,
    workflow: state,
    stageId,
    stageDef: def,
    stage,
    phase,
    // Landmarks of the active stage in its frame (T2 cranial-base aligned in chained stages).
    points,
    nativePoints: stage.points,
    placedCount: countPlaced(def, stage.points),
    activeLandmark: active,
    roi,
    preAlign,
    t2Transform,
    placementGuide,
    preprocessMode: effectivePreprocessMode,
    showAnnotations,
    running,
    busy,
    exporting,
    error: stage.error ?? exportError,
    isOverlayPhase,
    canRun,
    canExportT1,
    autoRunArmed,
    nextStage,
    allDone: allDone(state),
    // Placed points or results that a reset would discard.
    hasWork: STAGE_IDS.some((id) => countPlaced(stageDef(id), state.stages[id].points) > 0 || !!state.stages[id].result),
    actions: {
      runAlignment,
      usePreAlignment,
      cancelAutoRun: () => dispatch({ type: 'cancelAutoRun', stageId }),
      exportT1,
      exportAlignedT2,
      exportAllAlignedT2,
      exportResults,
      loadImageFile,
      removeImage,
      placeLandmark,
      selectLandmark,
      clearLandmark,
      resetSession,
      setMode,
      setActiveStage,
      // Any stage's settings can be edited, not only the active stage's.
      setParams: (id: StageId, params: Partial<AlignmentParams>) => { if (!running) dispatch({ type: 'setParams', stageId: id, params }); },
      restoreDefaults: (id: StageId) => { if (!running) dispatch({ type: 'restoreDefaults', stageId: id }); },
      setPreprocessMode: (mode: PreprocessMode) => {
        setPreprocessModeState(mode);
        dispatch({ type: 'clearRuns' });
      },
      // Calibration changes discard all runs.
      setCalibration: (keys: readonly ImageKey[], scale: Partial<PixelScale>) => {
        calibration.setManual(keys, scale);
        dispatch({ type: 'clearRuns' });
      },
      copyT1CalibrationToT2: () => {
        calibration.copyT1ToT2();
        dispatch({ type: 'clearRuns' });
      },
      resetCalibration: () => {
        calibration.reset(resolutions);
        dispatch({ type: 'clearRuns' });
      },
      toggleAnnotations: () => setShowAnnotations((value) => !value),
    },
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;

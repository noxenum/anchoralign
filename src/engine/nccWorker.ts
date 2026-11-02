/// <reference lib="webworker" />
import {
  DEFAULT_PX_PER_MM,
  applyAffine,
  computePreAlignMatrix,
  computeTranslationReadings,
  decompose,
  mul23,
  rotateAboutDeg,
  transformPointPair,
  translate,
} from '@/lib/geometry';
import { alignmentScore, cycleTerminationReason, evaluateCandidate, normalizeMaxCycles } from './alignmentPolicy';
import type { Affine6 } from '@/types';
import type { AlignRequest } from './engineClient';

const ctx = self as unknown as DedicatedWorkerGlobalScope & { Module?: unknown };
const OPENCV_RUNTIME_URL = `${import.meta.env.BASE_URL}vendor/opencv/opencv.js`;

// OpenCV.js is a classic UMD script and cannot be imported as an ES module, so
// it is evaluated as a script. It reads the global Module and calls back once
// its WebAssembly runtime is ready.
ctx.Module = {
  onRuntimeInitialized() {
    ctx.postMessage({ type: 'ready' });
  },
};
fetch(OPENCV_RUNTIME_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`${OPENCV_RUNTIME_URL} returned ${response.status}`);
    return response.text();
  })
  .then((source) => new Function(source)())
  .catch((err) => {
    ctx.postMessage({
      type: 'error',
      payload: { message: `Failed to load the alignment runtime: ${err?.message ?? String(err)}`, stack: err?.stack },
    });
  });

type LoadedImages = {
  t1Raw: any;
  t2Raw: any;
  t1Clahe: any;
  t2Clahe: any;
  t1EdgeRaw: any;
  t2EdgeRaw: any;
  t1EdgeClahe: any;
  t2EdgeClahe: any;
  t2Validity: any;
};

let images: LoadedImages | null = null;
let previews: { t1: Blob; t2: Blob } | null = null;
let imageCacheKey = '';
let PX_PER_MM = DEFAULT_PX_PER_MM;
let activeScoreMode = 'gray';
// Transform from native T2 into the frame of points.t2 (null: native T2).
let T2_BASE: Affine6 | null = null;

ctx.onmessage = async (event) => {
  const { type, payload } = event.data ?? {};
  try {
    if (type === 'loadImages') await loadImages(payload);
    if (type === 'align') await align(payload);
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      payload: { message: err?.message ?? String(err), stack: err?.stack },
    });
  }
};

async function loadImages({ t1Url, t2Url }) {
  const nextKey = `${t1Url}|${t2Url}`;
  if (!images || nextKey !== imageCacheKey) {
    deleteImages();
    const [t1Raw, t2Raw] = await Promise.all([fetchAsGrayMat(t1Url), fetchAsGrayMat(t2Url)]);
    const t2Validity = new cv.Mat(t2Raw.rows, t2Raw.cols, cv.CV_8UC1);
    t2Validity.data.fill(255);
    const t1Clahe = applyClahe(t1Raw);
    const t2Clahe = applyClahe(t2Raw);
    images = {
      t1Raw,
      t2Raw,
      t1Clahe,
      t2Clahe,
      t1EdgeRaw: gradientMagnitude(t1Raw),
      t2EdgeRaw: gradientMagnitude(t2Raw),
      t1EdgeClahe: gradientMagnitude(t1Clahe),
      t2EdgeClahe: gradientMagnitude(t2Clahe),
      t2Validity,
    };
    previews = { t1: await matToPng(t1Clahe), t2: await matToPng(t2Clahe) };
    imageCacheKey = nextKey;
  }
  ctx.postMessage({
    type: 'imagesLoaded',
    payload: {
      t1: { width: images.t1Raw.cols, height: images.t1Raw.rows },
      t2: { width: images.t2Raw.cols, height: images.t2Raw.rows },
      claheT1: previews.t1,
      claheT2: previews.t2,
    },
  });
}

async function fetchAsGrayMat(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();

  const rgba = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  return gray;
}

// The vendored OpenCV.js build does not include CLAHE, so it is implemented
// here: 8×8 tiles, clip limit 2, bilinear interpolation between tile LUTs.
function applyClahe(gray, clipLimit = 2.0, gridX = 8, gridY = 8) {
  const width = gray.cols;
  const height = gray.rows;
  const src = gray.data;
  const out = new cv.Mat(height, width, cv.CV_8UC1);
  const dst = out.data;

  const luts = [];
  for (let ty = 0; ty < gridY; ty += 1) {
    luts[ty] = [];
    const y0 = Math.floor((ty * height) / gridY);
    const y1 = Math.floor(((ty + 1) * height) / gridY);
    for (let tx = 0; tx < gridX; tx += 1) {
      const x0 = Math.floor((tx * width) / gridX);
      const x1 = Math.floor(((tx + 1) * width) / gridX);
      luts[ty][tx] = buildClaheLut(src, width, x0, x1, y0, y1, clipLimit);
    }
  }

  for (let y = 0; y < height; y += 1) {
    const gy = ((y + 0.5) * gridY) / height - 0.5;
    const yLo = clamp(Math.floor(gy), 0, gridY - 1);
    const yHi = clamp(yLo + 1, 0, gridY - 1);
    const ay = clamp(gy - yLo, 0, 1);
    for (let x = 0; x < width; x += 1) {
      const gx = ((x + 0.5) * gridX) / width - 0.5;
      const xLo = clamp(Math.floor(gx), 0, gridX - 1);
      const xHi = clamp(xLo + 1, 0, gridX - 1);
      const ax = clamp(gx - xLo, 0, 1);
      const v = src[y * width + x];
      const top = luts[yLo][xLo][v] * (1 - ax) + luts[yLo][xHi][v] * ax;
      const bottom = luts[yHi][xLo][v] * (1 - ax) + luts[yHi][xHi][v] * ax;
      dst[y * width + x] = Math.round(top * (1 - ay) + bottom * ay);
    }
  }

  return out;
}

function buildClaheLut(src, width, x0, x1, y0, y1, clipLimit) {
  const hist = new Array(256).fill(0);
  for (let y = y0; y < y1; y += 1) {
    const row = y * width;
    for (let x = x0; x < x1; x += 1) hist[src[row + x]] += 1;
  }

  const tilePixels = Math.max(1, (x1 - x0) * (y1 - y0));
  const limit = Math.max(1, Math.floor((clipLimit * tilePixels) / 256));
  let excess = 0;
  for (let i = 0; i < 256; i += 1) {
    if (hist[i] > limit) {
      excess += hist[i] - limit;
      hist[i] = limit;
    }
  }

  const redist = Math.floor(excess / 256);
  let remainder = excess - redist * 256;
  for (let i = 0; i < 256; i += 1) hist[i] += redist;
  for (let i = 0; remainder > 0; i = (i + 1) % 256, remainder -= 1) hist[i] += 1;

  const lut = new Uint8Array(256);
  let cdf = 0;
  for (let i = 0; i < 256; i += 1) {
    cdf += hist[i];
    lut[i] = clamp(Math.round((cdf * 255) / tilePixels), 0, 255);
  }
  return lut;
}

function gradientMagnitude(gray) {
  const out = new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1);
  const src = gray.data;
  const dst = out.data;
  const width = gray.cols;
  const height = gray.rows;

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(width - 1, x + 1);
      const gx = src[y * width + x1] - src[y * width + x0];
      const gy = src[y1 * width + x] - src[y0 * width + x];
      dst[y * width + x] = Math.min(255, Math.round((Math.abs(gx) + Math.abs(gy)) / 2));
    }
  }
  return out;
}

function matToPng(gray): Promise<Blob> {
  const rgba = new Uint8ClampedArray(gray.cols * gray.rows * 4);
  const src = gray.data;
  for (let i = 0, j = 0; i < src.length; i += 1, j += 4) {
    rgba[j] = src[i];
    rgba[j + 1] = src[i];
    rgba[j + 2] = src[i];
    rgba[j + 3] = 255;
  }
  const canvas = new OffscreenCanvas(gray.cols, gray.rows);
  canvas.getContext('2d').putImageData(new ImageData(rgba, gray.cols, gray.rows), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

function matToGrayPatch(gray) {
  return {
    width: gray.cols,
    height: gray.rows,
    data: gray.data.slice().buffer,
  };
}

function postEventWithSnapshot(type, payload) {
  const transferables = [];
  const snapshot = payload.historySnapshot;
  if (snapshot) {
    for (const roiSnapshot of [snapshot.roi1, snapshot.roi2]) {
      for (const side of [roiSnapshot.fixed, roiSnapshot.moving]) {
        transferables.push(side.gray.data, side.edge.data);
      }
    }
  }
  ctx.postMessage({ type, payload }, transferables);
}

function activeMats(preprocessMode) {
  const useClahe = preprocessMode === 'clahe';
  return {
    t1: useClahe ? images.t1Clahe : images.t1Raw,
    t2: useClahe ? images.t2Clahe : images.t2Raw,
    t1Edge: useClahe ? images.t1EdgeClahe : images.t1EdgeRaw,
    t2Edge: useClahe ? images.t2EdgeClahe : images.t2EdgeRaw,
    effectiveMode: useClahe ? 'clahe' : 'raw',
  };
}

async function align({
  points, roi, pxPerMm, stepDeg, stepMm, rotRange, trRange,
  maxCycles = 4, preprocessMode = 'raw', scoreMode = 'gray', rotationMode = 'moving', refinement = true, t2Base = null,
}: AlignRequest) {
  if (!images) throw new Error('Images have not been loaded');

  PX_PER_MM = pxPerMm || DEFAULT_PX_PER_MM;
  T2_BASE = t2Base;
  activeScoreMode = scoreMode === 'blend' ? 'blend' : 'gray';
  const activeRotationMode = rotationMode === 'ring' ? 'ring' : 'moving';
  const mats = activeMats(preprocessMode);
  const { t1, t1Edge, effectiveMode } = mats;
  const preM = computePreAlignMatrix(points);
  const templates = createFixedTemplates(t1, t1Edge, points, roi);
  try {
    let bestM: Affine6 = preM;
    let bestScores = scoreFixedFrameRois(mats, bestM, points, roi, templates);
    if (!bestScores.valid) {
      throw new Error('Pre-alignment has no fully valid ROI candidates');
    }
    let bestAccumAngle = 0;
    let bestAccumDxPx = 0;
    let bestAccumDyPx = 0;
    let rotationLimitHit = false;
    let translationLimitHit = false;
    let n = 1;
    let cyclesRun = 0;
    let terminationReason = null;
    const translationLimitMm = Math.min(2, Math.max(0, trRange));
    const cycleCount = normalizeMaxCycles(maxCycles);

    const initialResult = buildResult(preM, preM, bestScores, points, {
      preprocessMode: effectiveMode, rotationMode: activeRotationMode, accumAngle: 0, accumTxPx: 0, accumTyPx: 0,
      searchLimitHit: false, converged: false, terminationReason: 'pre-alignment-only', cyclesRun: 0,
    });
    postEventWithSnapshot('preAlign', {
      initialResult,
      scoreMode: activeScoreMode,
      angleDeg: decompose(bestM).angleDeg,
      score: bestScores.blendedNcc,
      roi1Score: bestScores.roi1Score,
      roi2Score: bestScores.roi2Score,
      grayNcc: bestScores.grayNcc,
      edgeNcc: bestScores.edgeNcc,
      blendedNcc: bestScores.blendedNcc,
      matrix: bestM.slice(),
      preprocessMode: effectiveMode,
      historySnapshot: createHistorySnapshot(mats, bestM, points, roi, templates, 'both', effectiveMode),
    });

    if (!refinement) {
      ctx.postMessage({ type: 'done', payload: initialResult });
      return;
    }

    for (let cycle = 0; cycle < cycleCount; cycle += 1) {
      cyclesRun = cycle + 1;
      const cycleStartM = bestM;
      const rotAnchor = applyAffine(cycleStartM, points.t2.rp1);

      if (activeRotationMode === 'ring') {
        // Ring segment: rotation and translation are found together. Each angle
        // re-seats RP1 via ROI1, then fixed-frame ROI2 picks the angle; the pair
        // is applied only when the displayed fixed-frame score improves.
        const ringBaseline = bestScores;
        const ring = searchRingSegment(
          mats,
          cycleStartM,
          rotAnchor,
          points,
          roi,
          templates,
          -rotRange - bestAccumAngle,
          rotRange - bestAccumAngle,
          stepDeg,
          { x: bestAccumDxPx, y: bestAccumDyPx },
          translationLimitMm,
          stepMm,
        );
        const ringDecision = evaluateCandidate(ringBaseline.blendedNcc, ring.scores.blendedNcc, ring.scores);
        const ringAccepted = ringDecision.accepted;
        if (ringAccepted) {
          bestM = ring.matrix;
          bestAccumAngle += ring.dAngle;
          bestAccumDxPx += ring.dxPx;
          bestAccumDyPx += ring.dyPx;
          rotationLimitHit = ring.rotationHitBoundary;
          translationLimitHit = ring.translationHitBoundary;
        }
        bestScores = scoreFixedFrameRois(mats, bestM, points, roi, templates);
        postIteration({
          n: n++,
          cycle: cycle + 1,
          kind: 'ring',
          objective: 'ring',
          dAngle: ringAccepted ? round(ring.dAngle, 6) : 0,
          dx: ringAccepted ? ring.dxPx / PX_PER_MM : 0,
          dy: ringAccepted ? ring.dyPx / PX_PER_MM : 0,
          candidateDAngle: round(ring.dAngle, 6),
          candidateDx: ring.dxPx / PX_PER_MM,
          candidateDy: ring.dyPx / PX_PER_MM,
          selectionScore: ring.selectionScore,
          baselineScore: ringBaseline.blendedNcc,
          candidateScore: ring.scores.blendedNcc,
          scores: bestScores,
          matrix: bestM,
          anchor: rotAnchor,
          points,
          accepted: ringAccepted,
          rejectionReasons: ringDecision.rejectionReasons,
          fixedFrameBaseline: fixedScorePair(ringBaseline),
          fixedFrameCandidate: fixedScorePair(ring.scores),
          hitBoundary: ring.rotationHitBoundary || ring.translationHitBoundary,
          historySnapshot: createHistorySnapshot(mats, ring.matrix, points, roi, templates, 'both', effectiveMode),
        });
        terminationReason = cycleTerminationReason(ringAccepted, false, cycle + 1, cycleCount);
        if (terminationReason) break;
        await yieldToBrowser();
        continue;
      }

      const rotationBaseline = scoreMovingRoi(mats, cycleStartM, points.t2.rp2, roi.rp2, templates.rp2);
      const rot = searchRotation(
        mats,
        cycleStartM,
        rotAnchor,
        points.t2.rp2,
        roi.rp2,
        templates.rp2,
        -rotRange - bestAccumAngle,
        rotRange - bestAccumAngle,
        stepDeg,
      );
      const rotatedM = mul23(rotateAboutDeg(rot.dAngle, rotAnchor.x, rotAnchor.y), cycleStartM);
      const rotationFixedBaseline = bestScores;
      const rotationFixedCandidate = scoreFixedFrameRois(mats, rotatedM, points, roi, templates);
      const rotationDecision = evaluateCandidate(rotationBaseline.blendedNcc, rot.scores.blendedNcc, rotationFixedCandidate);
      const rotationAccepted = rotationDecision.accepted;
      if (rotationAccepted) {
        bestM = rotatedM;
        bestAccumAngle += rot.dAngle;
        rotationLimitHit = rot.hitBoundary;
      }
      bestScores = scoreFixedFrameRois(mats, bestM, points, roi, templates);
      postIteration({
        n: n++,
        cycle: cycle + 1,
        kind: 'rot',
        objective: 'roi2',
        dAngle: rotationAccepted ? round(rot.dAngle, 6) : 0,
        candidateDAngle: round(rot.dAngle, 6),
        dx: 0,
        dy: 0,
        baselineScore: rotationBaseline.blendedNcc,
        candidateScore: rot.scores.blendedNcc,
        scores: bestScores,
        matrix: bestM,
        anchor: rotAnchor,
        points,
        accepted: rotationAccepted,
        rejectionReasons: rotationDecision.rejectionReasons,
        fixedFrameBaseline: fixedScorePair(rotationFixedBaseline),
        fixedFrameCandidate: fixedScorePair(rotationFixedCandidate),
        hitBoundary: rot.hitBoundary,
        historySnapshot: createHistorySnapshot(mats, rotatedM, points, roi, templates, 'roi2', effectiveMode),
      });

      const translationBaseline = scoreFixedFrameRoi(mats, bestM, points.t1.rp1, roi.rp1, templates.rp1);
      const tr = searchTranslation(
        mats,
        bestM,
        points.t1.rp1,
        roi.rp1,
        templates.rp1,
        { x: bestAccumDxPx, y: bestAccumDyPx },
        translationLimitMm,
        stepMm,
      );
      const translatedM = mul23(translate(tr.dxPx, tr.dyPx), bestM);
      const translationCandidate = scoreFixedFrameRoi(mats, translatedM, points.t1.rp1, roi.rp1, templates.rp1);
      const translationFixedBaseline = bestScores;
      const translationFixedCandidate = scoreFixedFrameRois(mats, translatedM, points, roi, templates);
      const translationDecision = evaluateCandidate(
        translationBaseline.blendedNcc, translationCandidate.blendedNcc,
        translationFixedCandidate,
      );
      const translationAccepted = translationDecision.accepted;
      const translationHistory = createHistorySnapshot(mats, translatedM, points, roi, templates, 'roi1', effectiveMode);
      if (translationAccepted) {
        bestM = translatedM;
        bestAccumDxPx += tr.dxPx;
        bestAccumDyPx += tr.dyPx;
        translationLimitHit = tr.hitBoundary;
      }
      bestScores = scoreFixedFrameRois(mats, bestM, points, roi, templates);
      postIteration({
        n: n++,
        cycle: cycle + 1,
        kind: 'tr',
        objective: 'roi1',
        dAngle: 0,
        dx: translationAccepted ? tr.dxPx / PX_PER_MM : 0,
        dy: translationAccepted ? tr.dyPx / PX_PER_MM : 0,
        candidateDx: tr.dxPx / PX_PER_MM,
        candidateDy: tr.dyPx / PX_PER_MM,
        baselineScore: translationBaseline.blendedNcc,
        candidateScore: translationCandidate.blendedNcc,
        scores: bestScores,
        matrix: bestM,
        points,
        accepted: translationAccepted,
        rejectionReasons: translationDecision.rejectionReasons,
        fixedFrameBaseline: fixedScorePair(translationFixedBaseline),
        fixedFrameCandidate: fixedScorePair(translationFixedCandidate),
        hitBoundary: tr.hitBoundary,
        historySnapshot: translationHistory,
      });

      terminationReason = cycleTerminationReason(rotationAccepted, translationAccepted, cycle + 1, cycleCount);
      if (terminationReason) break;
      await yieldToBrowser();
    }
    terminationReason ??= 'max-cycles';

    ctx.postMessage({
      type: 'done',
      payload: buildResult(bestM, preM, bestScores, points, {
        preprocessMode: effectiveMode, rotationMode: activeRotationMode,
        accumAngle: bestAccumAngle, accumTxPx: bestAccumDxPx, accumTyPx: bestAccumDyPx,
        searchLimitHit: rotationLimitHit || translationLimitHit,
        converged: terminationReason === 'both-rejected', terminationReason, cyclesRun,
      }),
    });
  } finally {
    deleteFixedTemplates(templates);
  }
}

function fixedScorePair(scores) {
  return { valid: scores.valid, roi1Score: scores.roi1Score, roi2Score: scores.roi2Score };
}

function buildResult(matrix, preM, scores, points, state) {
  const movingPoints = transformPointPair(matrix, points.t2);
  return {
    ...state, matrix: matrix.slice(), totalAngle: decompose(matrix).angleDeg,
    scoreMode: activeScoreMode, score: scores.blendedNcc,
    grayNcc: scores.grayNcc, edgeNcc: scores.edgeNcc, blendedNcc: scores.blendedNcc,
    roi1Score: scores.roi1Score, roi2Score: scores.roi2Score, movingPoints,
    rp1ResidualMm: pointDistance(movingPoints.rp1, points.t1.rp1) / PX_PER_MM,
    rp2ResidualMm: pointDistance(movingPoints.rp2, points.t1.rp2) / PX_PER_MM,
    ...computeTranslationReadings(points, matrix, preM, PX_PER_MM),
  };
}

function postIteration({ scores, matrix, points, baselineScore, candidateScore, historySnapshot, ...payload }) {
  postEventWithSnapshot('iteration', {
    ...payload,
    scoreMode: activeScoreMode,
    score: scores.blendedNcc,
    grayNcc: scores.grayNcc,
    edgeNcc: scores.edgeNcc,
    blendedNcc: scores.blendedNcc,
    roi1Score: scores.roi1Score,
    roi2Score: scores.roi2Score,
    baselineScore,
    candidateScore,
    objectiveDelta: candidateScore - baselineScore,
    matrix: matrix.slice(),
    movingPoints: transformPointPair(matrix, points.t2),
    historySnapshot,
  });
}

function searchRotation(mats, M, anchor, movingPoint, roi, template, minAngleDeg, maxAngleDeg, stepDeg) {
  let best = { dAngle: 0, scores: invalidScoreBreakdown() };
  const evaluate = (dAngle) => {
    try {
      const Mtest = mul23(rotateAboutDeg(dAngle, anchor.x, anchor.y), M);
      const scores = scoreMovingRoi(mats, Mtest, movingPoint, roi, template);
      if (scores.blendedNcc > best.scores.blendedNcc) best = { dAngle, scores };
    } catch (err) {
      if (!isInvalidSampleError(err)) throw err;
    }
  };

  const coarseStepDeg = Math.max(0.1, stepDeg);
  for (const dAngle of steppedRange(minAngleDeg, maxAngleDeg, coarseStepDeg)) {
    evaluate(dAngle);
  }
  if (best.scores.valid && stepDeg < coarseStepDeg) {
    const refineRadiusDeg = Math.max(0.15, coarseStepDeg);
    const refineStart = clamp(best.dAngle - refineRadiusDeg, minAngleDeg, maxAngleDeg);
    const refineEnd = clamp(best.dAngle + refineRadiusDeg, minAngleDeg, maxAngleDeg);
    for (const dAngle of steppedRange(refineStart, refineEnd, stepDeg)) {
      evaluate(dAngle);
    }
  }
  if (!best.scores.valid) {
    throw new Error('Rotation search has no fully valid ROI₂ candidates');
  }
  return {
    ...best,
    hitBoundary: angleHitBoundary(best.dAngle, minAngleDeg, maxAngleDeg, stepDeg),
  };
}

function searchRingSegment(mats, M, anchor, points, roi, templates, minAngleDeg, maxAngleDeg, stepDeg, accumulated, limitMm, stepMm) {
  const limitPx = limitMm * PX_PER_MM;
  const seen = new Set();
  let best = null;
  const evaluate = (dAngle) => {
    const key = dAngle.toFixed(6);
    if (seen.has(key)) return;
    seen.add(key);
    const rotatedM = mul23(rotateAboutDeg(dAngle, anchor.x, anchor.y), M);
    const tr = matchTranslationPeak(mats, rotatedM, points.t1.rp1, roi.rp1, templates.rp1, accumulated, limitPx);
    if (!tr) return;
    const candidateM = mul23(translate(tr.dxPx, tr.dyPx), rotatedM);
    const roi2 = scoreFixedFrameRoi(mats, candidateM, points.t1.rp2, roi.rp2, templates.rp2);
    if (roi2.valid && Number.isFinite(roi2.blendedNcc) && (!best || roi2.blendedNcc > best.selectionScore)) {
      best = { dAngle, selectionScore: roi2.blendedNcc };
    }
  };

  const coarseStepDeg = Math.max(0.1, stepDeg);
  // The current angle is always a candidate, so translation alone can win.
  if (minAngleDeg <= 0 && maxAngleDeg >= 0) evaluate(0);
  for (const dAngle of steppedRange(minAngleDeg, maxAngleDeg, coarseStepDeg)) evaluate(dAngle);
  if (best && stepDeg < coarseStepDeg) {
    const refineRadiusDeg = Math.max(0.15, coarseStepDeg);
    const refineStart = clamp(best.dAngle - refineRadiusDeg, minAngleDeg, maxAngleDeg);
    const refineEnd = clamp(best.dAngle + refineRadiusDeg, minAngleDeg, maxAngleDeg);
    for (const dAngle of steppedRange(refineStart, refineEnd, stepDeg)) evaluate(dAngle);
  }
  if (!best) throw new Error('Ring segment search has no fully valid ROI candidates');

  // Subpixel translation for the chosen angle, then the full fixed-frame score.
  const rotatedM = mul23(rotateAboutDeg(best.dAngle, anchor.x, anchor.y), M);
  const tr = searchTranslation(mats, rotatedM, points.t1.rp1, roi.rp1, templates.rp1, accumulated, limitMm, stepMm);
  const matrix = mul23(translate(tr.dxPx, tr.dyPx), rotatedM);
  return {
    dAngle: best.dAngle,
    dxPx: tr.dxPx,
    dyPx: tr.dyPx,
    matrix,
    selectionScore: best.selectionScore,
    scores: scoreFixedFrameRois(mats, matrix, points, roi, templates),
    rotationHitBoundary: angleHitBoundary(best.dAngle, minAngleDeg, maxAngleDeg, stepDeg),
    translationHitBoundary: tr.hitBoundary,
  };
}

function angleHitBoundary(dAngle, minAngleDeg, maxAngleDeg, stepDeg) {
  return maxAngleDeg - minAngleDeg > stepDeg / 2 && (
    nearlyEqual(dAngle, minAngleDeg, stepDeg / 2) ||
    nearlyEqual(dAngle, maxAngleDeg, stepDeg / 2)
  );
}

function translationBounds(accumulated, limitPx) {
  return {
    minDx: -limitPx - accumulated.x,
    maxDx: limitPx - accumulated.x,
    minDy: -limitPx - accumulated.y,
    maxDy: limitPx - accumulated.y,
  };
}

// Runs matchTemplate for the gray (and, in blend mode, edge) channel and returns
// a scorer over the result map. The caller must call dispose().
function matchTemplateScores(context) {
  const grayResult = new cv.Mat();
  const edgeResult = new cv.Mat();
  const dispose = () => {
    grayResult.delete();
    edgeResult.delete();
  };
  const useEdge = activeScoreMode === 'blend' && context.template.edgeUsable;
  try {
    cv.matchTemplate(context.gray, context.template.gray, grayResult, cv.TM_CCOEFF_NORMED);
    if (useEdge) cv.matchTemplate(context.edge, context.template.edge, edgeResult, cv.TM_CCOEFF_NORMED);
  } catch (err) {
    dispose();
    throw err;
  }
  const cols = grayResult.cols;
  return {
    cols,
    rows: grayResult.rows,
    scoreAt: (x, y) => blendNcc(
      grayResult.data32F[y * cols + x],
      useEdge ? edgeResult.data32F[y * cols + x] : null,
    ),
    dispose,
  };
}

// Best ROI1 translation on the integer matchTemplate map, refined by a
// parabolic peak fit. Used for every ring-segment angle, so it stays cheap.
function matchTranslationPeak(mats, M, fixedPoint, roi, template, accumulated, limitPx) {
  const boundsPx = translationBounds(accumulated, limitPx);
  const context = createTranslationContext(mats, M, fixedPoint, roi, template, boundsPx);
  const map = matchTemplateScores(context);
  try {
    const { cols, rows, scoreAt } = map;
    let best = null;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const candidate = translationCandidateAt(context, boundsPx, accumulated, limitPx, x, y);
        if (!candidate) continue;
        const score = scoreAt(x, y);
        if (Number.isFinite(score) && (!best || score > best.score)) best = { ...candidate, x, y, score };
      }
    }
    if (!best) return null;

    const peakOffset = (left, centre, right) => {
      const curvature = left - 2 * centre + right;
      if (!(curvature < 0) || !Number.isFinite(left) || !Number.isFinite(right)) return 0;
      return clamp((0.5 * (left - right)) / curvature, -0.5, 0.5);
    };
    const offsetX = best.x > 0 && best.x < cols - 1
      ? peakOffset(scoreAt(best.x - 1, best.y), best.score, scoreAt(best.x + 1, best.y))
      : 0;
    const offsetY = best.y > 0 && best.y < rows - 1
      ? peakOffset(scoreAt(best.x, best.y - 1), best.score, scoreAt(best.x, best.y + 1))
      : 0;
    const dxPx = best.dxPx - offsetX;
    const dyPx = best.dyPx - offsetY;
    const refinedValid =
      withinTranslationLimit(accumulated.x + dxPx, accumulated.y + dyPx, limitPx) &&
      isValidPatchAt(context.validity, context.centerX - dxPx, context.centerY - dyPx, context.w, context.h);
    return refinedValid ? { dxPx, dyPx } : { dxPx: best.dxPx, dyPx: best.dyPx };
  } finally {
    map.dispose();
    deleteTranslationContext(context);
  }
}

// Maps a matchTemplate result position to a translation, or null when the
// patch is not fully valid or the translation leaves the allowed range.
function translationCandidateAt(context, boundsPx, accumulated, limitPx, x, y) {
  const centerX = x + (context.w - 1) / 2;
  const centerY = y + (context.h - 1) / 2;
  if (!isValidPatchAt(context.validity, centerX, centerY, context.w, context.h)) return null;
  const dxPx = context.centerX - centerX;
  const dyPx = context.centerY - centerY;
  if (
    dxPx < boundsPx.minDx || dxPx > boundsPx.maxDx ||
    dyPx < boundsPx.minDy || dyPx > boundsPx.maxDy ||
    !withinTranslationLimit(accumulated.x + dxPx, accumulated.y + dyPx, limitPx)
  ) return null;
  return { dxPx, dyPx };
}

function searchTranslation(mats, M, fixedPoint, roi, template, accumulated, limitMm, stepMm) {
  const limitPx = limitMm * PX_PER_MM;
  const boundsPx = translationBounds(accumulated, limitPx);
  const stepPx = Math.max(0.001, stepMm * PX_PER_MM);
  const context = createTranslationContext(mats, M, fixedPoint, roi, template, boundsPx);
  let best = null;

  // Grid search of radius around the current best; keeps only valid improvements.
  const refineAround = (radiusPx, gridStepPx) => {
    const center = { x: best.dxPx, y: best.dyPx };
    const xs = steppedRange(
      clamp(center.x - radiusPx, boundsPx.minDx, boundsPx.maxDx),
      clamp(center.x + radiusPx, boundsPx.minDx, boundsPx.maxDx),
      gridStepPx,
    );
    const ys = steppedRange(
      clamp(center.y - radiusPx, boundsPx.minDy, boundsPx.maxDy),
      clamp(center.y + radiusPx, boundsPx.minDy, boundsPx.maxDy),
      gridStepPx,
    );
    for (const dxPx of xs) {
      for (const dyPx of ys) {
        if (!withinTranslationLimit(accumulated.x + dxPx, accumulated.y + dyPx, limitPx)) continue;
        const scores = scoreTranslationContext(context, dxPx, dyPx);
        if (scores.valid && scores.blendedNcc > best.scores.blendedNcc) {
          best = { dxPx, dyPx, scores };
        }
      }
    }
  };

  try {
    for (const candidate of searchTranslationCoarse(context, boundsPx, accumulated, limitPx)) {
      const scores = scoreTranslationContext(context, candidate.dxPx, candidate.dyPx);
      if (scores.valid && (!best || scores.blendedNcc > best.scores.blendedNcc)) {
        best = { ...candidate, scores };
      }
    }
    if (!best) throw new Error('Translation search has no fully valid ROI candidates');

    refineAround(0.55, Math.max(0.1, stepPx * 2));
    refineAround(Math.max(0.12, stepPx * 2), stepPx);
  } finally {
    deleteTranslationContext(context);
  }

  const totalTranslation = Math.hypot(accumulated.x + best.dxPx, accumulated.y + best.dyPx);
  return {
    ...best,
    hitBoundary: nearlyEqual(totalTranslation, limitPx, Math.max(stepPx / 2, 0.02 * PX_PER_MM)),
  };
}

// The 32 best integer-pixel translations from matchTemplate, as seeds for the
// subpixel refinement.
function searchTranslationCoarse(context, boundsPx, accumulated, limitPx) {
  const map = matchTemplateScores(context);
  try {
    const candidates = [];
    for (let y = 0; y < map.rows; y += 1) {
      for (let x = 0; x < map.cols; x += 1) {
        const candidate = translationCandidateAt(context, boundsPx, accumulated, limitPx, x, y);
        if (!candidate) continue;
        const coarseScore = map.scoreAt(x, y);
        if (Number.isFinite(coarseScore)) candidates.push({ ...candidate, coarseScore });
      }
    }
    candidates.sort((a, b) => b.coarseScore - a.coarseScore);
    return candidates.slice(0, 32);
  } finally {
    map.dispose();
  }
}

function createTranslationContext(mats, M, fixedPoint, roi, template, boundsPx) {
  const w = roiPx(roi.w);
  const h = roiPx(roi.h);
  const padX = Math.ceil(Math.max(Math.abs(boundsPx.minDx), Math.abs(boundsPx.maxDx))) + 3;
  const padY = Math.ceil(Math.max(Math.abs(boundsPx.minDy), Math.abs(boundsPx.maxDy))) + 3;
  const largeW = w + padX * 2;
  const largeH = h + padY * 2;
  return {
    gray: warpAt(mats.t2, M, fixedPoint, largeW, largeH),
    edge: warpAt(mats.t2Edge, M, fixedPoint, largeW, largeH),
    validity: warpAt(images.t2Validity, M, fixedPoint, largeW, largeH),
    template,
    w,
    h,
    centerX: (largeW - 1) / 2,
    centerY: (largeH - 1) / 2,
  };
}

function deleteTranslationContext(context) {
  context.gray.delete();
  context.edge.delete();
  context.validity.delete();
}

function scoreTranslationContext(context, dxPx, dyPx) {
  const centerX = context.centerX - dxPx;
  const centerY = context.centerY - dyPx;
  if (!isValidPatchAt(context.validity, centerX, centerY, context.w, context.h)) {
    return invalidScoreBreakdown();
  }
  const grayB = extractSubpixelPatch(context.gray, centerX, centerY, context.w, context.h);
  const edgeB = extractSubpixelPatch(context.edge, centerX, centerY, context.w, context.h);
  try {
    return scorePatchPair(context.template, grayB, edgeB);
  } finally {
    grayB.delete();
    edgeB.delete();
  }
}

function extractSubpixelPatch(src, centerX, centerY, w, h) {
  const out = new cv.Mat(h, w, cv.CV_8UC1);
  const data = out.data;
  const srcData = src.data;
  const startX = centerX - (w - 1) / 2;
  const startY = centerY - (h - 1) / 2;

  for (let y = 0; y < h; y += 1) {
    const sy = startY + y;
    const y0 = Math.floor(sy);
    const y1 = y0 + 1;
    const fy = sy - y0;
    for (let x = 0; x < w; x += 1) {
      const sx = startX + x;
      const x0 = Math.floor(sx);
      const x1 = x0 + 1;
      const fx = sx - x0;
      const v00 = readGray(srcData, src.cols, src.rows, x0, y0);
      const v10 = readGray(srcData, src.cols, src.rows, x1, y0);
      const v01 = readGray(srcData, src.cols, src.rows, x0, y1);
      const v11 = readGray(srcData, src.cols, src.rows, x1, y1);
      const top = v00 + (v10 - v00) * fx;
      const bottom = v01 + (v11 - v01) * fx;
      data[y * w + x] = Math.max(0, Math.min(255, Math.round(top + (bottom - top) * fy)));
    }
  }
  return out;
}

function readGray(data, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return data[y * width + x];
}

function extractROI(mat, center, roi) {
  const w = roiPx(roi.w);
  const h = roiPx(roi.h);
  const startX = center.x - (w - 1) / 2;
  const startY = center.y - (h - 1) / 2;
  if (
    Math.floor(startX) < 0 ||
    Math.floor(startY) < 0 ||
    Math.ceil(startX + w - 1) >= mat.cols ||
    Math.ceil(startY + h - 1) >= mat.rows
  ) {
    throw new Error('A fixed T1 ROI extends outside the image');
  }
  return extractSubpixelPatch(mat, center.x, center.y, w, h);
}

// Samples the warped T2 ROI and throws an INVALID_SAMPLE error when any of its
// pixels falls outside T2.
function sampleWarpedValid(t2, M, centerInT1, roi) {
  const w = roiPx(roi.w);
  const h = roiPx(roi.h);
  const image = warpAt(t2, M, centerInT1, w, h);
  const validity = warpAt(images.t2Validity, M, centerInT1, w, h);
  const valid = isFullyValid(validity);
  validity.delete();
  if (!valid) {
    image.delete();
    throw invalidSampleError();
  }
  return image;
}

// Samples a T2-derived image (gray, edges or validity) through M, a transform
// from the frame of points.t2 onto T1, into a w × h patch centred in T1.
function warpAt(source, M, centerInT1, w, h) {
  const x0 = centerInT1.x - (w - 1) / 2;
  const y0 = centerInT1.y - (h - 1) / 2;
  const Moff = T2_BASE ? mul23(M, T2_BASE) : M.slice();
  Moff[2] -= x0;
  Moff[5] -= y0;
  const Mcv = cv.matFromArray(2, 3, cv.CV_64F, Moff);
  const out = new cv.Mat();
  try {
    cv.warpAffine(source, out, Mcv, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0));
  } finally {
    Mcv.delete();
  }
  return out;
}

function isFullyValid(validity) {
  const data = validity.data;
  for (let i = 0; i < data.length; i += 1) {
    if (data[i] !== 255) return false;
  }
  return true;
}

function isValidPatchAt(validity, centerX, centerY, w, h) {
  const startX = centerX - (w - 1) / 2;
  const startY = centerY - (h - 1) / 2;
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  const x1 = Math.ceil(startX + w - 1);
  const y1 = Math.ceil(startY + h - 1);
  if (x0 < 0 || y0 < 0 || x1 >= validity.cols || y1 >= validity.rows) return false;
  const data = validity.data;
  for (let y = y0; y <= y1; y += 1) {
    const row = y * validity.cols;
    for (let x = x0; x <= x1; x += 1) {
      if (data[row + x] !== 255) return false;
    }
  }
  return true;
}

function invalidSampleError() {
  return Object.assign(new Error('Moving T2 ROI extends outside the image'), { code: 'INVALID_SAMPLE' });
}

function isInvalidSampleError(err) {
  return err?.code === 'INVALID_SAMPLE';
}

function ncc(a, b) {
  if (a.rows !== b.rows || a.cols !== b.cols) return -1;
  const left = a.data;
  const right = b.data;
  const length = left.length;
  if (!length || right.length !== length) return -1;
  let sumLeft = 0;
  let sumRight = 0;
  let sumSquaresLeft = 0;
  let sumSquaresRight = 0;
  let sumProducts = 0;
  for (let i = 0; i < length; i += 1) {
    const x = left[i];
    const y = right[i];
    sumLeft += x;
    sumRight += y;
    sumSquaresLeft += x * x;
    sumSquaresRight += y * y;
    sumProducts += x * y;
  }
  const numerator = length * sumProducts - sumLeft * sumRight;
  const varianceLeft = length * sumSquaresLeft - sumLeft * sumLeft;
  const varianceRight = length * sumSquaresRight - sumRight * sumRight;
  const denominator = Math.sqrt(Math.max(0, varianceLeft) * Math.max(0, varianceRight));
  if (denominator <= 1e-12) return -1;
  const score = numerator / denominator;
  return Number.isFinite(score) ? clamp(score, -1, 1) : -1;
}

function createFixedTemplates(t1, t1Edge, points, roi) {
  return {
    rp1: createFixedTemplate(t1, t1Edge, points.t1.rp1, roi.rp1),
    rp2: createFixedTemplate(t1, t1Edge, points.t1.rp2, roi.rp2),
  };
}

function createFixedTemplate(t1, t1Edge, center, roi) {
  const gray = extractROI(t1, center, roi);
  const edge = extractROI(t1Edge, center, roi);
  return {
    gray,
    edge,
    edgeUsable: hasSignal(edge),
  };
}

function deleteFixedTemplates(templates) {
  templates.rp1.gray.delete();
  templates.rp1.edge.delete();
  templates.rp2.gray.delete();
  templates.rp2.edge.delete();
}

function createHistorySnapshot(mats, M, points, roi, templates, objective, preprocessMode) {
  const roi2Center = objective === 'roi2'
    ? applyAffine(M, points.t2.rp2)
    : points.t1.rp2;
  return {
    scoreMode: activeScoreMode,
    candidateMatrix: M.slice(),
    objective,
    preprocessMode,
    roi1: createRoiComparisonSnapshot(
      mats,
      M,
      points.t1.rp1,
      roi.rp1,
      templates.rp1,
      'fixed-frame',
      objective === 'roi1' || objective === 'both',
    ),
    roi2: createRoiComparisonSnapshot(
      mats,
      M,
      roi2Center,
      roi.rp2,
      templates.rp2,
      objective === 'roi2' ? 'moving-landmark' : 'fixed-frame',
      objective === 'roi2' || objective === 'both',
    ),
  };
}

function createRoiComparisonSnapshot(mats, M, center, roi, template, sampling, active) {
  let movingGray = null;
  let movingEdge = null;
  try {
    let valid = true;
    try {
      movingGray = sampleWarpedValid(mats.t2, M, center, roi);
    } catch (error) {
      if (!isInvalidSampleError(error)) throw error;
      valid = false;
      movingGray = warpAt(mats.t2, M, center, roiPx(roi.w), roiPx(roi.h));
    }
    movingEdge = warpAt(mats.t2Edge, M, center, roiPx(roi.w), roiPx(roi.h));
    const scores = valid ? scorePatchPair(template, movingGray, movingEdge) : invalidScoreBreakdown();
    return {
      valid,
      fixed: {
        gray: matToGrayPatch(template.gray),
        edge: matToGrayPatch(template.edge),
      },
      moving: {
        gray: matToGrayPatch(movingGray),
        edge: matToGrayPatch(movingEdge),
      },
      scores: {
        grayNcc: scores.grayNcc,
        edgeNcc: scores.edgeNcc,
        blendedNcc: scores.blendedNcc,
        edgeUsed: activeScoreMode === 'blend' && Number.isFinite(scores.edgeNcc),
      },
      sampling,
      active,
    };
  } finally {
    movingGray?.delete();
    movingEdge?.delete();
  }
}

function scoreMovingRoi(mats, M, movingPoint, roi, template) {
  const center = applyAffine(M, movingPoint);
  return scoreWarpedRoi(mats, M, center, roi, template);
}

function scoreFixedFrameRois(mats, M, points, roi, templates) {
  const roi1 = scoreFixedFrameRoi(mats, M, points.t1.rp1, roi.rp1, templates.rp1);
  const roi2 = scoreFixedFrameRoi(mats, M, points.t1.rp2, roi.rp2, templates.rp2);
  return combineRoiScores(roi1, roi2);
}

function scoreFixedFrameRoi(mats, M, fixedCenter, roi, template) {
  try {
    return scoreWarpedRoi(mats, M, fixedCenter, roi, template);
  } catch (err) {
    if (isInvalidSampleError(err)) return invalidScoreBreakdown();
    throw err;
  }
}

function scoreWarpedRoi(mats, M, center, roi, template) {
  let grayB = null;
  let edgeB = null;
  try {
    grayB = sampleWarpedValid(mats.t2, M, center, roi);
    edgeB = warpAt(mats.t2Edge, M, center, roiPx(roi.w), roiPx(roi.h));
    return scorePatchPair(template, grayB, edgeB);
  } finally {
    grayB?.delete();
    edgeB?.delete();
  }
}

function scorePatchPair(template, grayB, edgeB) {
  const grayNcc = ncc(template.gray, grayB);
  const edgeNcc = template.edgeUsable && hasSignal(edgeB)
    ? ncc(template.edge, edgeB)
    : null;
  return {
    valid: Number.isFinite(grayNcc),
    grayNcc,
    edgeNcc: Number.isFinite(edgeNcc) ? edgeNcc : null,
    blendedNcc: blendNcc(grayNcc, edgeNcc),
  };
}

function combineRoiScores(roi1, roi2) {
  const valid = roi1.valid && roi2.valid;
  return {
    valid,
    roi1Score: roi1.blendedNcc,
    roi2Score: roi2.blendedNcc,
    grayNcc: meanFinite([roi1.grayNcc, roi2.grayNcc]) ?? -1,
    edgeNcc: meanFinite([roi1.edgeNcc, roi2.edgeNcc]),
    blendedNcc: valid ? meanFinite([roi1.blendedNcc, roi2.blendedNcc]) ?? -1 : -Infinity,
  };
}

function invalidScoreBreakdown() {
  return {
    valid: false,
    grayNcc: -1,
    edgeNcc: null,
    blendedNcc: -Infinity,
  };
}

function blendNcc(grayNcc, edgeNcc) {
  return alignmentScore(grayNcc, edgeNcc, activeScoreMode === 'blend' ? 'blend' : 'gray');
}

function hasSignal(mat, minimumStdDev = 1) {
  const data = mat.data;
  if (!data?.length) return false;
  let sum = 0;
  let sumSquares = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i];
    sumSquares += data[i] * data[i];
  }
  const mean = sum / data.length;
  const variance = Math.max(0, sumSquares / data.length - mean * mean);
  return Math.sqrt(variance) >= minimumStdDev;
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function meanFinite(values: (number | null)[]): number | null {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function steppedRange(from, to, step) {
  const values = [];
  const decimals = Math.max(0, (String(step).split('.')[1] || '').length + 2);
  const count = Math.floor((to - from) / step + 0.5);
  for (let i = 0; i <= count; i += 1) values.push(round(from + i * step, decimals));
  if (values[values.length - 1] < to - step * 0.25) values.push(to);
  return values;
}

function roiPx(mm) {
  return Math.max(2, Math.round(mm * PX_PER_MM));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function withinTranslationLimit(x, y, limitPx) {
  return Math.hypot(x, y) <= limitPx + 1e-9;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function nearlyEqual(a, b, tolerance) {
  return Math.abs(a - b) <= Math.max(tolerance, 1e-9);
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deleteImages() {
  if (images) for (const mat of Object.values(images)) mat.delete();
  images = null;
  previews = null;
}

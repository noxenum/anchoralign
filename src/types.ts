import type { ImageResolution } from '@/lib/imageResolution';

export type ScoreMode = 'gray' | 'blend';
export type PreprocessMode = 'raw' | 'clahe';
// moving: ROI2 follows RP2B2 (0.4.4); ring: ROI2 fixed at RP2B1 while T2 rotates about RP1.
export type RotationMode = 'moving' | 'ring';
export type FixedFrameScores = { valid: boolean; roi1Score: number; roi2Score: number };
export type RejectionReason = 'invalid-roi' | 'insufficient-improvement';

export type ImageKey = 't1' | 't2';
export type LandmarkKey = 'rp1' | 'rp2';

export type Point = { x: number; y: number };

export type ImageSize = { width: number; height: number };

export type Affine6 = [number, number, number, number, number, number];

export type LandmarkDraft = {
  t1: {
    rp1: Point | null;
    rp2: Point | null;
  };
  t2: {
    rp1: Point | null;
    rp2: Point | null;
  };
};

export type PlacementArcGuide = {
  center: Point;
  radius: number;
  startAngleDeg: number;
  midAngleDeg: number;
  endAngleDeg: number;
  start: Point;
  midpoint: Point;
  end: Point;
  label: string;
};

export type PointPair = {
  rp1: Point;
  rp2: Point;
};

export type LandmarkSet = {
  t1: PointPair;
  t2: PointPair;
};

export type RoiSize = {
  w: number;
  h: number;
};

export type RoiConfig = {
  rp1: RoiSize;
  rp2: RoiSize;
};

export type GrayPatch = {
  width: number;
  height: number;
  data: ArrayBuffer;
};

export type CorrelationScoreBreakdown = {
  grayNcc: number;
  edgeNcc: number | null;
  blendedNcc: number;
  edgeUsed: boolean;
};

export type RoiComparisonSnapshot = {
  valid?: boolean;
  fixed: {
    gray: GrayPatch;
    edge: GrayPatch;
  };
  moving: {
    gray: GrayPatch;
    edge: GrayPatch;
  };
  scores: CorrelationScoreBreakdown;
  sampling: 'fixed-frame' | 'moving-landmark';
  active: boolean;
};

export type RoiHistorySnapshot = {
  scoreMode: ScoreMode;
  candidateMatrix: Affine6;
  objective: 'roi1' | 'roi2' | 'both';
  preprocessMode: PreprocessMode;
  roi1: RoiComparisonSnapshot;
  roi2: RoiComparisonSnapshot;
};

export type IterationEvent = {
  scoreMode: ScoreMode;
  n: number;
  cycle: number;
  kind: 'rot' | 'tr' | 'ring';
  objective: 'roi1' | 'roi2' | 'ring';
  selectionScore?: number;
  dAngle?: number;
  dx?: number;
  dy?: number;
  candidateDAngle?: number;
  candidateDx?: number;
  candidateDy?: number;
  score: number;
  fixedFrameBaseline: FixedFrameScores;
  fixedFrameCandidate: FixedFrameScores;
  rejectionReasons: RejectionReason[];
  baselineScore: number;
  candidateScore: number;
  objectiveDelta: number;
  grayNcc?: number;
  edgeNcc?: number | null;
  blendedNcc?: number;
  roi1Score?: number;
  roi2Score?: number;
  accepted?: boolean;
  matrix?: Affine6;
  anchor?: Point;
  movingPoints?: PointPair;
  hitBoundary?: boolean;
  historySnapshot?: RoiHistorySnapshot;
};

export type PreAlignEvent = {
  initialResult: AlignmentResult;
  scoreMode: ScoreMode;
  angleDeg: number;
  score: number;
  roi1Score?: number;
  roi2Score?: number;
  grayNcc?: number;
  edgeNcc?: number | null;
  blendedNcc?: number;
  matrix: Affine6;
  preprocessMode?: PreprocessMode;
  historySnapshot?: RoiHistorySnapshot;
};

export type AlignmentResult = {
  scoreMode: ScoreMode;
  matrix: Affine6;
  totalAngle: number;
  score: number;
  grayNcc: number;
  edgeNcc: number | null;
  blendedNcc: number;
  accumAngle: number;
  accumTxPx: number;
  accumTyPx: number;
  preprocessMode?: PreprocessMode;
  rotationMode?: RotationMode;
  roi1Score: number;
  roi2Score: number;
  rp1ResidualMm: number;
  rp2ResidualMm: number;
  movingPoints: PointPair;
  searchLimitHit: boolean;
  converged: boolean;
  terminationReason: 'both-rejected' | 'max-cycles' | 'pre-alignment-only';
  cyclesRun: number;
  rp1b2DisplaceMm: number;
  rp1b2DxMm: number;
  rp1b2DyMm: number;
  rp1b1TransferMm: number;
  rp1b1TransferDxMm: number;
  rp1b1TransferDyMm: number;
};

// An uploaded image as shown in the UI. Width and height are known once the
// worker has decoded it.
export type LoadedImage = {
  src: string | null;
  claheSrc: string | null;
  name: string;
  width: number | null;
  height: number | null;
  resolution: ImageResolution | null;
};

export type ImagePair = Record<ImageKey, LoadedImage>;

// Landmark geometry of the pre-alignment, completed by the worker's scores once
// a run has started.
export type PreAlignSummary = Partial<PreAlignEvent> & {
  angle: number;
  tx_mm: number;
  ty_mm: number;
  lenV1_mm: number;
  lenV2_mm: number;
  dLen_mm: number;
  initialScore?: number;
  matrix: Affine6;
};

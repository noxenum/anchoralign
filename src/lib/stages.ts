import type { ImageKey, LandmarkKey, RoiConfig, RotationMode, ScoreMode } from '@/types';

export type StageId = 'cranialBase' | 'mandible' | 'maxilla';

// Alignment parameters of one superimposition.
export type AlignmentParams = {
  scoreMode: ScoreMode;
  rotationMode: RotationMode;
  // ROI₁ is square; ROI₂ is width × height.
  roi1Mm: number;
  roi2W: number;
  roi2H: number;
  stepDeg: number;
  stepMm: number;
  maxCycles: number;
};

export type StageDef = {
  id: StageId;
  name: string;
  // Reference structures; a stage without rp2 uses one point per image (RP2 = RP1).
  rp1: string;
  rp2: string | null;
  // Standard settings of the stage.
  defaults: AlignmentParams;
};

// The three standard superimpositions, in workflow order. Mandible and maxilla
// are superimposed on T2 as aligned on the cranial base.
export const STAGE_DEFS: readonly StageDef[] = [
  {
    id: 'cranialBase',
    name: 'Cranial base',
    rp1: "Walker's point",
    rp2: 'Cribriform plate',
    defaults: { scoreMode: 'gray', rotationMode: 'ring', roi1Mm: 10, roi2W: 3, roi2H: 10, stepDeg: 0.01, stepMm: 0.01, maxCycles: 4 },
  },
  {
    id: 'mandible',
    name: 'Mandible',
    rp1: 'Cortical chin',
    rp2: 'Mandibular canal',
    defaults: { scoreMode: 'gray', rotationMode: 'ring', roi1Mm: 18, roi2W: 6, roi2H: 14, stepDeg: 0.01, stepMm: 0.01, maxCycles: 4 },
  },
  {
    id: 'maxilla',
    name: 'Maxilla',
    rp1: 'Zygomatic process',
    rp2: null,
    defaults: { scoreMode: 'gray', rotationMode: 'ring', roi1Mm: 20, roi2W: 20, roi2H: 20, stepDeg: 0.01, stepMm: 0.01, maxCycles: 4 },
  },
];

export const STAGE_IDS: readonly StageId[] = STAGE_DEFS.map((def) => def.id);

export function stageDef(id: StageId): StageDef {
  return STAGE_DEFS.find((def) => def.id === id);
}

export function roiConfig(params: AlignmentParams): RoiConfig {
  return {
    rp1: { w: params.roi1Mm, h: params.roi1Mm },
    rp2: { w: params.roi2W, h: params.roi2H },
  };
}

export function isSinglePoint(def: StageDef): boolean {
  return def.rp2 === null;
}

// One click the user makes: a reference structure on T1 or T2.
export type LandmarkMeta = {
  id: string;
  stageId: StageId;
  key: LandmarkKey;
  image: ImageKey;
  // Anatomical name, e.g. "Walker's point".
  name: string;
  // Point code, e.g. "RP1B2" (reference point 1 on image 2).
  code: string;
};

// The clicks of a stage in placement order: each structure on T1, then on T2.
export function stageLandmarks(def: StageDef): LandmarkMeta[] {
  const keys: LandmarkKey[] = isSinglePoint(def) ? ['rp1'] : ['rp1', 'rp2'];
  return keys.flatMap((key) => (['t1', 't2'] as const).map((image) => ({
    id: `${def.id}:${key}-${image}`,
    stageId: def.id,
    key,
    image,
    name: key === 'rp1' ? def.rp1 : def.rp2,
    code: `${key.toUpperCase()}${image === 't1' ? 'B1' : 'B2'}`,
  })));
}

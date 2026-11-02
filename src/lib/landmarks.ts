import { isSinglePoint, stageLandmarks, type LandmarkMeta, type StageDef } from '@/lib/stages';
import type { ImageKey, LandmarkDraft, LandmarkKey, LandmarkSet, Point } from '@/types';

export const EMPTY_LANDMARKS: LandmarkDraft = {
  t1: { rp1: null, rp2: null },
  t2: { rp1: null, rp2: null },
};

export function isPlaced(points: LandmarkDraft, meta: LandmarkMeta): boolean {
  return !!points[meta.image][meta.key];
}

// Number of clicks made in a stage (2 for a single-point stage when done, else 4).
export function countPlaced(def: StageDef, points: LandmarkDraft): number {
  return stageLandmarks(def).filter((meta) => isPlaced(points, meta)).length;
}

export function isComplete(points: LandmarkDraft): points is LandmarkSet {
  return !!(points.t1.rp1 && points.t1.rp2 && points.t2.rp1 && points.t2.rp2);
}

// Sets a point; in a single-point stage RP2 always equals RP1.
export function withPoint(def: StageDef, points: LandmarkDraft, image: ImageKey, key: LandmarkKey, point: Point | null): LandmarkDraft {
  const next = { ...points[image], [key]: point };
  if (isSinglePoint(def)) next.rp2 = next.rp1;
  return { ...points, [image]: next };
}

// The landmark to place next: the one picked by the user while it is unplaced,
// otherwise the first unplaced one in placement order. Once all are placed, the
// last one stays active.
export function activeLandmark(def: StageDef, points: LandmarkDraft, selectedId: string | null): LandmarkMeta {
  const landmarks = stageLandmarks(def);
  return (
    landmarks.find((meta) => meta.id === selectedId && !isPlaced(points, meta)) ??
    landmarks.find((meta) => !isPlaced(points, meta)) ??
    landmarks[landmarks.length - 1]
  );
}

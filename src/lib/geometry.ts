import type {
  Affine6,
  LandmarkDraft,
  LandmarkSet,
  ImageSize,
  PlacementArcGuide,
  Point,
  PointPair,
  RoiSize,
} from '@/types';

export const DEFAULT_PX_PER_MM = 4.2;
export const IDENTITY: Affine6 = [1, 0, 0, 0, 1, 0];

export function framePointToImage(
  screenPoint: Point,
  frame: { left: number; top: number; width: number; height: number },
  imageSize: ImageSize,
): Point {
  return {
    x: ((screenPoint.x - frame.left) / frame.width) * imageSize.width,
    y: ((screenPoint.y - frame.top) / frame.height) * imageSize.height,
  };
}

export function pointAtAngle(center: Point, radius: number, angleDeg: number): Point {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + radius * Math.cos(angleRad),
    y: center.y + radius * Math.sin(angleRad),
  };
}

export function createRp2B2PlacementGuide(
  points: LandmarkDraft,
  halfSpanDeg = 25,
): PlacementArcGuide | null {
  const { rp1: rp1B1, rp2: rp2B1 } = points.t1;
  const { rp1: rp1B2, rp2: rp2B2 } = points.t2;
  if (!rp1B1 || !rp2B1 || !rp1B2 || rp2B2) return null;

  const dx = rp2B1.x - rp1B1.x;
  const dy = rp2B1.y - rp1B1.y;
  const radius = Math.hypot(dx, dy);
  if (!Number.isFinite(radius) || radius <= 1e-9) return null;

  const span = Number.isFinite(halfSpanDeg) ? Math.abs(halfSpanDeg) : 25;
  const midAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const startAngleDeg = midAngleDeg - span;
  const endAngleDeg = midAngleDeg + span;
  const center = { ...rp1B2 };

  return {
    center,
    radius,
    startAngleDeg,
    midAngleDeg,
    endAngleDeg,
    start: pointAtAngle(center, radius, startAngleDeg),
    midpoint: pointAtAngle(center, radius, midAngleDeg),
    end: pointAtAngle(center, radius, endAngleDeg),
    label: `RP2B2 placement arc · ±${span}°`,
  };
}

// Radius of the landmark rings, kept within 80% of the smaller ROI side (stroke included).
export function markerRadius(roi: RoiSize, pxPerMm: number, preferred = 36): number {
  return Math.max(0, Math.min(preferred, Math.min(roi.w, roi.h) * pxPerMm * 0.4 - 1));
}

export function placementArcPath(guide: PlacementArcGuide): string {
  return [
    `M ${guide.start.x} ${guide.start.y}`,
    `A ${guide.radius} ${guide.radius} 0 0 1 ${guide.end.x} ${guide.end.y}`,
  ].join(' ');
}

export function applyAffine(M: Affine6, p: Point): Point {
  return {
    x: M[0] * p.x + M[1] * p.y + M[2],
    y: M[3] * p.x + M[4] * p.y + M[5],
  };
}

export function transformPointPair(M: Affine6, points: PointPair): PointPair {
  return { rp1: applyAffine(M, points.rp1), rp2: applyAffine(M, points.rp2) };
}

// Like transformPointPair, for pairs whose points may still be unplaced.
export function transformDraftPair(M: Affine6, points: LandmarkDraft['t1']): LandmarkDraft['t1'] {
  return {
    rp1: points.rp1 && applyAffine(M, points.rp1),
    rp2: points.rp2 && applyAffine(M, points.rp2),
  };
}

export function affineToCssTransform(M: Affine6 | null | undefined, scaleX = 1, scaleY = 1): string {
  if (!M) return '';
  const safeScaleX = Math.abs(scaleX) > 1e-12 ? scaleX : 1;
  const safeScaleY = Math.abs(scaleY) > 1e-12 ? scaleY : 1;
  const values = [
    M[0],
    M[3] * (safeScaleY / safeScaleX),
    M[1] * (safeScaleX / safeScaleY),
    M[4],
    M[2] * safeScaleX,
    M[5] * safeScaleY,
  ];
  return `matrix(${values.join(', ')})`;
}

export function mul23(A: Affine6, B: Affine6): Affine6 {
  const [a, b, tx, c, d, ty] = A;
  const [e, f, ux, g, h, uy] = B;
  return [
    a * e + b * g,
    a * f + b * h,
    a * ux + b * uy + tx,
    c * e + d * g,
    c * f + d * h,
    c * ux + d * uy + ty,
  ];
}

export function translate(tx: number, ty: number): Affine6 {
  return [1, 0, tx, 0, 1, ty];
}

export function rotateAboutDeg(angle: number, cx = 0, cy = 0): Affine6 {
  const r = (angle * Math.PI) / 180;
  const cs = Math.cos(r);
  const sn = Math.sin(r);
  return [
    cs,
    -sn,
    cx - cs * cx + sn * cy,
    sn,
    cs,
    cy - sn * cx - cs * cy,
  ];
}

export function inverseAffine(M: Affine6): Affine6 {
  const [a, b, tx, c, d, ty] = M;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) throw new Error('Affine matrix is not invertible');
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [
    ia,
    ib,
    -(ia * tx + ib * ty),
    ic,
    id,
    -(ic * tx + id * ty),
  ];
}

export function decompose(M: Affine6): { angleDeg: number; tx: number; ty: number } {
  return {
    angleDeg: (Math.atan2(M[3], M[0]) * 180) / Math.PI,
    tx: M[2],
    ty: M[5],
  };
}

export function preAlignAngleDeg(points: LandmarkSet): number {
  const v1x = points.t1.rp2.x - points.t1.rp1.x;
  const v1y = points.t1.rp2.y - points.t1.rp1.y;
  const v2x = points.t2.rp2.x - points.t2.rp1.x;
  const v2y = points.t2.rp2.y - points.t2.rp1.y;
  let deg = ((Math.atan2(v1y, v1x) - Math.atan2(v2y, v2x)) * 180) / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg <= -180) deg += 360;
  return deg;
}

// Rotate T2 about its RP1 so both RP1→RP2 vectors are parallel, then shift RP1B2 onto RP1B1.
export function computePreAlignMatrix(points: LandmarkSet): Affine6 {
  return mul23(
    translate(points.t1.rp1.x - points.t2.rp1.x, points.t1.rp1.y - points.t2.rp1.y),
    rotateAboutDeg(preAlignAngleDeg(points), points.t2.rp1.x, points.t2.rp1.y),
  );
}

export function computeTranslationReadings(points: LandmarkSet, fullM: Affine6, preM: Affine6, pxPerMm: number) {
  const rp1b2After = applyAffine(fullM, points.t2.rp1);
  const rp1b2DxMm = (rp1b2After.x - points.t2.rp1.x) / pxPerMm;
  const rp1b2DyMm = (rp1b2After.y - points.t2.rp1.y) / pxPerMm;

  const preInv = inverseAffine(preM);
  const rp1b1TransferredToT2 = applyAffine(preInv, points.t1.rp1);
  const rp1b1TransferDxMm = (points.t2.rp1.x - rp1b1TransferredToT2.x) / pxPerMm;
  const rp1b1TransferDyMm = (points.t2.rp1.y - rp1b1TransferredToT2.y) / pxPerMm;

  return {
    rp1b2DisplaceMm: Math.hypot(rp1b2DxMm, rp1b2DyMm),
    rp1b2DxMm,
    rp1b2DyMm,
    rp1b1TransferMm: Math.hypot(rp1b1TransferDxMm, rp1b1TransferDyMm),
    rp1b1TransferDxMm,
    rp1b1TransferDyMm,
  };
}

// Rotation, translation and vector lengths of the pre-alignment, in degrees and mm.
export function preAlignGeometry(points: LandmarkSet, pxPerMm: number) {
  const lenV1 = Math.hypot(points.t1.rp2.x - points.t1.rp1.x, points.t1.rp2.y - points.t1.rp1.y);
  const lenV2 = Math.hypot(points.t2.rp2.x - points.t2.rp1.x, points.t2.rp2.y - points.t2.rp1.y);
  return {
    angle: preAlignAngleDeg(points),
    tx_mm: (points.t1.rp1.x - points.t2.rp1.x) / pxPerMm,
    ty_mm: (points.t1.rp1.y - points.t2.rp1.y) / pxPerMm,
    lenV1_mm: lenV1 / pxPerMm,
    lenV2_mm: lenV2 / pxPerMm,
    dLen_mm: (lenV1 - lenV2) / pxPerMm,
  };
}

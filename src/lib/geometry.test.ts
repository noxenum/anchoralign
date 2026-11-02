import { describe, expect, it } from 'vitest';
import {
  affineToCssTransform,
  applyAffine,
  computePreAlignMatrix,
  createRp2B2PlacementGuide,
  framePointToImage,
  markerRadius,
  mul23,
  rotateAboutDeg,
  translate,
} from './geometry';
import type { LandmarkDraft, LandmarkSet, Point } from '@/types';

const closePoint = (actual: Point, expected: Point, digits = 6) => {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
};

const draftPoints = (overrides: Partial<LandmarkDraft> = {}): LandmarkDraft => ({
  t1: {
    rp1: { x: 100, y: 100 },
    rp2: { x: 200, y: 100 },
    ...overrides.t1,
  },
  t2: {
    rp1: { x: 300, y: 400 },
    rp2: null,
    ...overrides.t2,
  },
});

describe('affine math', () => {
  it('applies identity', () => {
    closePoint(applyAffine([1, 0, 0, 0, 1, 0], { x: 10, y: 20 }), { x: 10, y: 20 });
  });

  it('applies pure translation', () => {
    closePoint(applyAffine(translate(5, -3), { x: 10, y: 20 }), { x: 15, y: 17 });
  });

  it('applies pure 90 degree rotation about origin', () => {
    closePoint(applyAffine(rotateAboutDeg(90), { x: 1, y: 0 }), { x: 0, y: 1 });
  });

  it('applies 90 degree rotation about a point', () => {
    closePoint(applyAffine(rotateAboutDeg(90, 5, 5), { x: 5, y: 6 }), { x: 4, y: 5 });
  });

  it('composes translate after rotate in CSS-compatible order', () => {
    const M = mul23(translate(2, 0), rotateAboutDeg(90));
    closePoint(applyAffine(M, { x: 1, y: 0 }), { x: 2, y: 1 });
  });
});

describe('native image coordinate mapping', () => {
  it.each([
    [1439, 1513],
    [1439, 1713],
    [1439, 1706],
  ])('maps the frame corners and center for %d×%d', (width, height) => {
    const frame = { left: 100, top: 50, width: 720, height: 500 };
    closePoint(
      framePointToImage({ x: frame.left, y: frame.top }, frame, { width, height }),
      { x: 0, y: 0 },
    );
    closePoint(
      framePointToImage(
        { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 },
        frame,
        { width, height },
      ),
      { x: width / 2, y: height / 2 },
    );
    closePoint(
      framePointToImage(
        { x: frame.left + frame.width, y: frame.top + frame.height },
        frame,
        { width, height },
      ),
      { x: width, y: height },
    );
  });
});

describe('moving ROI geometry', () => {
  it('keeps RP1 fixed and moves RP2 around it during rotation', () => {
    const rp1 = { x: 300, y: 400 };
    const rp2 = { x: 400, y: 400 };
    const M = rotateAboutDeg(25, rp1.x, rp1.y);

    closePoint(applyAffine(M, rp1), rp1);
    closePoint(applyAffine(M, rp2), {
      x: rp1.x + 100 * Math.cos((25 * Math.PI) / 180),
      y: rp1.y + 100 * Math.sin((25 * Math.PI) / 180),
    });
  });

  it('moves both ROI centers by the selected translation', () => {
    const delta = { x: 12.5, y: -7.25 };
    const M = translate(delta.x, delta.y);

    closePoint(applyAffine(M, { x: 300, y: 400 }), { x: 312.5, y: 392.75 });
    closePoint(applyAffine(M, { x: 400, y: 500 }), { x: 412.5, y: 492.75 });
  });
});

describe('RP2B2 placement guide', () => {
  it('builds a 50 degree arc around the translated T1 landmark vector', () => {
    const guide = createRp2B2PlacementGuide(draftPoints());

    expect(guide).not.toBeNull();
    expect(guide!.center).toEqual({ x: 300, y: 400 });
    expect(guide!.radius).toBeCloseTo(100, 6);
    expect(guide!.startAngleDeg).toBeCloseTo(-25, 6);
    expect(guide!.midAngleDeg).toBeCloseTo(0, 6);
    expect(guide!.endAngleDeg).toBeCloseTo(25, 6);
    expect(guide!.label).toBe('RP2B2 placement arc · ±25°');
    closePoint(guide!.midpoint, { x: 400, y: 400 });

    for (const point of [guide!.start, guide!.midpoint, guide!.end]) {
      expect(Math.hypot(point.x - guide!.center.x, point.y - guide!.center.y))
        .toBeCloseTo(guide!.radius, 6);
    }
  });

  it.each([
    ['RP1B1', draftPoints({ t1: { rp1: null, rp2: { x: 200, y: 100 } } })],
    ['RP2B1', draftPoints({ t1: { rp1: { x: 100, y: 100 }, rp2: null } })],
    ['RP1B2', draftPoints({ t2: { rp1: null, rp2: null } })],
    ['placed RP2B2', draftPoints({ t2: { rp1: { x: 300, y: 400 }, rp2: { x: 400, y: 400 } } })],
  ])('omits the guide without a usable %s point', (_name, points) => {
    expect(createRp2B2PlacementGuide(points)).toBeNull();
  });

  it('omits the guide for a zero-length T1 vector', () => {
    const points = draftPoints({
      t1: {
        rp1: { x: 100, y: 100 },
        rp2: { x: 100, y: 100 },
      },
    });

    expect(createRp2B2PlacementGuide(points)).toBeNull();
  });
});

describe('pre-alignment', () => {
  it('maps the handoff example from T2 onto T1', () => {
    const points: LandmarkSet = {
      t1: { rp1: { x: 100, y: 100 }, rp2: { x: 200, y: 100 } },
      t2: { rp1: { x: 150, y: 150 }, rp2: { x: 150, y: 50 } },
    };
    const M = computePreAlignMatrix(points);
    const angleDeg = (Math.atan2(M[3], M[0]) * 180) / Math.PI;

    expect(angleDeg).toBeCloseTo(90, 6);
    closePoint(applyAffine(M, points.t2.rp1), points.t1.rp1);
    closePoint(applyAffine(M, points.t2.rp2), points.t1.rp2);
  });

  it('keeps current RP1B2 fixed when rotating about current RP1B2', () => {
    const points: LandmarkSet = {
      t1: { rp1: { x: 100, y: 100 }, rp2: { x: 200, y: 100 } },
      t2: { rp1: { x: 150, y: 150 }, rp2: { x: 150, y: 50 } },
    };
    const preM = computePreAlignMatrix(points);
    const translatedM = mul23(translate(12, -8), preM);
    const currentRp1B2 = applyAffine(translatedM, points.t2.rp1);
    const nextM = mul23(rotateAboutDeg(3.5, currentRp1B2.x, currentRp1B2.y), translatedM);

    closePoint(applyAffine(nextM, points.t2.rp1), currentRp1B2);
  });

  it('converts image-space affine matrices into scaled CSS matrix coordinates', () => {
    expect(affineToCssTransform([1, 0, 10, 0, 1, 20], 0.5, 0.25)).toBe('matrix(1, 0, 0, 1, 5, 5)');
    expect(affineToCssTransform([1, 2, 3, 4, 5, 6], 2, 4)).toBe('matrix(1, 8, 1, 5, 6, 24)');
  });
});

describe('independent landmark rings', () => {
  it('fits narrow ROI₂ and caps both dimensions regardless of ROI₁ size', () => {
    const narrow = { w: 2, h: 50 };
    const radius = markerRadius(narrow, 4.2);
    expect((radius + 1) * 2).toBeLessThanOrEqual(2 * 4.2 * 0.8);
    expect(markerRadius({ w: 50, h: 2 }, 4.2)).toBe(radius);
    expect(markerRadius({ w: 50, h: 50 }, 4.2)).toBe(36);
    expect(markerRadius(narrow, 0.1)).toBe(0);
  });
});

// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CephPane, type CephPaneProps } from './CephPane';
import type { Affine6 } from '@/types';

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let resize: () => void;
let paneSize: { width: number; height: number };
const points = Object.freeze({
  rp1: Object.freeze({ x: 100, y: 200 }),
  rp2: Object.freeze({ x: 300, y: 400 }),
});
const props = {
  imgSrc: 'synthetic.png', label: 'T2', dateStr: '', active: false,
  pendingPoint: null, points, roi: { rp1: { w: 25, h: 25 }, rp2: { w: 3, h: 10 } },
  showVector: true, affineMatrix: null,
  onPlace: undefined, paneId: 't2' as const, pxPerMm: 4, onFileDrop: undefined,
  placementGuide: null, imageSize: { width: 600, height: 800 },
};
function render(overrides: Partial<CephPaneProps> = {}) {
  act(() => root.render(<CephPane {...props} {...overrides} />));
}
function numberAttr(element: Element, name: string) {
  return Number(element.getAttribute(name));
}
function assertMarkers(expected: number[][]) {
  ['rp1', 'rp2'].forEach((key, index) => {
    const [x, y] = expected[index];
    for (const type of ['ring', 'dot']) {
      const circle = container.querySelector(`.crosshair-${type}.${key}`)!;
      expect(numberAttr(circle, 'cx')).toBeCloseTo(x);
      expect(numberAttr(circle, 'cy')).toBeCloseTo(y);
    }
    const group = container.querySelector(`.crosshair.${key}`)!;
    const arms = group.querySelectorAll('line');
    expect(numberAttr(arms[0], 'x1')).toBe(x - 20);
    expect(numberAttr(arms[0], 'y1')).toBe(y);
    expect(numberAttr(arms[3], 'x2')).toBe(x);
    expect(numberAttr(arms[3], 'y2')).toBe(y + 20);
    const label = group.querySelector('text')!;
    expect(numberAttr(label, 'x')).toBe(x + 14);
    expect(numberAttr(label, 'y')).toBe(y - 14);
    const rect = container.querySelector(`.roi-rect.${key}`)!;
    expect(numberAttr(rect, 'x') + numberAttr(rect, 'width') / 2).toBe(x);
    expect(numberAttr(rect, 'y') + numberAttr(rect, 'height') / 2).toBe(y);
  });
  const vector = container.querySelector('.vec-line')!;
  expect(['x1', 'y1', 'x2', 'y2'].map(a => numberAttr(vector, a))).toEqual(expected.flat());
  // Transform centres individually, keeping all labels and boxes upright.
  expect(container.querySelector('svg [transform]')).toBeNull();
  expect(container.querySelector('img')!.style.transition).toBe('none');
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  paneSize = { width: 300, height: 400 };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    ...paneSize, x: 0, y: 0, top: 0, left: 0, right: paneSize.width, bottom: paneSize.height,
    toJSON() {},
  }));
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { name: 'identity', matrix: [1, 0, 0, 0, 1, 0] as Affine6, expected: [[100, 200], [300, 400]], css: 'matrix(1, 0, 0, 1, 0, 0)' },
  { name: 'translation', matrix: [1, 0, 30, 0, 1, -40] as Affine6, expected: [[130, 160], [330, 360]], css: 'matrix(1, 0, 0, 1, 15, -20)' },
  { name: 'rotation and translation', matrix: [0, -1, 500, 1, 0, 20] as Affine6, expected: [[300, 120], [100, 320]], css: 'matrix(0, 1, -1, 0, 250, 10)' },
])('anchors both markers under $name', ({ matrix, expected, css }) => {
  render({ affineMatrix: matrix });
  assertMarkers(expected);
  expect(container.querySelector('img')!.style.transform).toBe(css);
});

it('keeps RP1 at the pivot while RP2 rotates with T2', () => {
  render({ affineMatrix: [0, -1, 300, 1, 0, 100] });
  assertMarkers([[100, 200], [-100, 400]]);
});

it('keeps image pixels and markers aligned at different native sizes and after resizing', () => {
  render({ affineMatrix: [0, -1, 500, 1, 0, 20], imageSize: { width: 1200, height: 800 } });
  assertMarkers([[300, 120], [100, 320]]);
  expect(container.querySelector('.img-frame')!.getAttribute('style')).toContain('height: 200px');
  expect(container.querySelector('img')!.style.transform).toBe('matrix(0, 1, -1, 0, 125, 5)');
  paneSize = { width: 600, height: 800 };
  act(() => resize());
  assertMarkers([[300, 120], [100, 320]]);
  expect(container.querySelector('img')!.style.transform).toBe('matrix(0, 1, -1, 0, 250, 10)');
});

it('restores the initial state without mutating or transforming landmarks twice', () => {
  const initial: Affine6 = [1, 0, 30, 0, 1, -40];
  render({ affineMatrix: initial });
  render({ affineMatrix: [0, -1, 500, 1, 0, 20] });
  render({ affineMatrix: initial });
  render({ affineMatrix: initial });
  assertMarkers([[130, 160], [330, 360]]);
  render();
  assertMarkers([[100, 200], [300, 400]]);
  expect(points).toEqual({ rp1: { x: 100, y: 200 }, rp2: { x: 300, y: 400 } });
});

it('preserves narrow ROI marker sizes and coordinates after hiding and showing annotations', () => {
  render({ affineMatrix: [1, 0, 30, 0, 1, -40] });
  const radius = numberAttr(container.querySelector('.crosshair-ring.rp2')!, 'r');
  expect(radius * 2).toBeLessThanOrEqual(3 * 4 * 0.8);
  render({ affineMatrix: [1, 0, 30, 0, 1, -40], showAnnotations: false });
  expect(container.querySelector('svg')).toBeNull();
  render({ affineMatrix: [1, 0, 30, 0, 1, -40] });
  assertMarkers([[130, 160], [330, 360]]);
  expect(numberAttr(container.querySelector('.crosshair-ring.rp2')!, 'r')).toBe(radius);
});

it('leaves T1 markers and scoring rectangles in their original frame', () => {
  render({ paneId: 't1' });
  assertMarkers([[100, 200], [300, 400]]);
  expect(container.querySelector('img')!.style.transform).toBe('none');
  expect(container.textContent).toContain('RP1B1');
});

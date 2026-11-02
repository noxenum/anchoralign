// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStrobe } from './useStrobe';

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let controls: ReturnType<typeof useStrobe>;
function Strobe({ active }: { active: boolean }) {
  controls = useStrobe(active);
  return <span>{controls.frame}</span>;
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('alternates at 333 ms, pauses, and restarts at T1 on re-entry', () => {
  act(() => root.render(<Strobe active />));
  expect(container.textContent).toBe('t1');
  act(() => vi.advanceTimersByTime(332));
  expect(container.textContent).toBe('t1');
  act(() => vi.advanceTimersByTime(1));
  expect(container.textContent).toBe('t2');
  act(() => controls.toggle());
  act(() => vi.advanceTimersByTime(999));
  expect(container.textContent).toBe('t2');
  act(() => root.render(<Strobe active={false} />));
  expect(vi.getTimerCount()).toBe(0);
  act(() => root.render(<Strobe active />));
  expect(container.textContent).toBe('t1');
  expect(controls.playing).toBe(true);
});

it('suspends in hidden tabs and cleans up its timer on unmount', () => {
  act(() => root.render(<Strobe active />));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(333));
  expect(container.textContent).toBe('t1');
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  act(() => vi.advanceTimersByTime(333));
  expect(container.textContent).toBe('t2');
  act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});

import { useEffect, useRef } from 'react';
import { comparisonToRgba, grayPatchToRgba, type DisplayRange } from '@/lib/patchRendering';
import type { GrayPatch } from '@/types';

type PatchCanvasProps =
  | { patch: GrayPatch; displayRange?: DisplayRange; fixed?: never; moving?: never; view?: never }
  | { fixed: GrayPatch; moving: GrayPatch; view: 'overlay' | 'difference'; patch?: never; displayRange?: never };

// Draws a single ROI patch, or the overlay/difference of a fixed and a moving patch.
export function PatchCanvas({ patch, displayRange, fixed, moving, view }: PatchCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const rendered = patch
      ? grayPatchToRgba(patch, displayRange)
      : comparisonToRgba(fixed, moving, view);
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    context.putImageData(new ImageData(rendered.data, rendered.width, rendered.height), 0, 0);
  }, [patch, fixed, moving, view, displayRange]);
  return <canvas ref={ref} aria-label="ROI correlation patch" />;
}

import { useMemo, useState } from 'react';
import { DEFAULT_PX_PER_MM } from '@/lib/geometry';
import {
  calibrationLabel,
  calibrationWarnings,
  nextCalibration,
  type CalibrationSource,
  type ImageResolutions,
} from '@/lib/imageResolution';
import type { ImagePair } from '@/types';

// Pixel scale of both images: from image metadata, entered manually or the default.
export function useCalibration(images: ImagePair) {
  const [pxPerMm, setPxPerMm] = useState(DEFAULT_PX_PER_MM);
  const [source, setSource] = useState<CalibrationSource>({ kind: 'default' });

  const warnings = useMemo(() => calibrationWarnings(
    pxPerMm,
    source,
    { t1: images.t1.resolution, t2: images.t2.resolution },
    !!(images.t1.src || images.t2.src),
  ), [pxPerMm, source, images.t1.resolution, images.t2.resolution, images.t1.src, images.t2.src]);

  // Called with the metadata of the images about to be shown.
  const applyResolutions = (resolutions: ImageResolutions) => {
    const next = nextCalibration(source, resolutions);
    setSource(next);
    if (next.kind === 'metadata') setPxPerMm(next.resolution.pxPerMm);
  };

  const setManual = (value: number) => {
    setPxPerMm(value);
    setSource({ kind: 'manual' });
  };

  return { pxPerMm, label: calibrationLabel(source), warnings, applyResolutions, setManual };
}

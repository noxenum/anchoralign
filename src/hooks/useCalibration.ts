import { useMemo, useState } from 'react';
import {
  initialCalibration, nextCalibration, resetCalibration, toWorkingScale, withManualScale, workingPxPerMm,
  type Calibration, type ImageResolutions, type PixelScale,
} from '@/lib/calibration';
import type { ImageKey } from '@/types';

// Pixel scale of T1 and T2 and the alignment frame derived from them.
export function useCalibration() {
  const [calibration, setCalibration] = useState<Calibration>(initialCalibration);

  const frame = useMemo(() => ({
    // px/mm of the alignment frame, which all mm values refer to.
    pxPerMm: workingPxPerMm(calibration),
    // Native pixels of each image → alignment frame scale (null: unchanged).
    t1Scale: toWorkingScale(calibration, 't1'),
    t2Scale: toWorkingScale(calibration, 't2'),
  }), [calibration]);

  return {
    calibration,
    ...frame,
    // Called with the metadata of the images about to be shown.
    applyResolutions: (resolutions: ImageResolutions) => setCalibration((current) => nextCalibration(current, resolutions)),
    setManual: (images: readonly ImageKey[], scale: Partial<PixelScale>) => setCalibration((current) => withManualScale(current, images, scale)),
    copyT1ToT2: () => setCalibration((current) => withManualScale(current, ['t2'], current.t1.scale)),
    reset: (resolutions: ImageResolutions) => setCalibration(resetCalibration(resolutions)),
  };
}

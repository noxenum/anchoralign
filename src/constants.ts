import type { OverlayMode } from '@/lib/settings';
import type { RotationMode, ScoreMode } from '@/types';

// Search limits of the refinement loop.
export const ROT_RANGE_DEG = 4;
export const TR_RANGE_MM = 2;

export const REPOSITORY_URL = 'https://github.com/noxenum/anchoralign';

export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp';

// Pause between placing the last point of a stage and the automatic start of
// its alignment (three-stage mode), so that a point can still be corrected.
export const AUTO_RUN_DELAY_MS = 3000;

export const OVERLAY_MODES: readonly { id: OverlayMode; title: string }[] = [
  { id: 'side', title: 'Side by side' },
  { id: 'tint', title: 'Color tint' },
  { id: 'opacity', title: 'Opacity blend' },
  { id: 'difference', title: 'Difference' },
  { id: 'strobe', title: 'Strobe' },
];

export const ROTATION_MODE_OPTIONS: readonly { value: RotationMode; label: string; description: string }[] = [
  { value: 'ring', label: 'Ring segment', description: 'ROI₂ fixed, rotate about RP1' },
  { value: 'moving', label: 'Moving centre', description: 'ROI₂ follows RP2B2' },
];

export const SCORE_MODE_OPTIONS: readonly { value: ScoreMode; label: string; description: string }[] = [
  { value: 'gray', label: 'Grayscale', description: 'Grayscale NCC only' },
  { value: 'blend', label: 'Grayscale + edges', description: '40% grayscale, 60% edge NCC' },
];

// ROI₂ width × height presets in mm.
export const ROI2_PRESETS = [[3, 10], [5, 12], [6, 14], [8, 16]] as const;

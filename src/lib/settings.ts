import type { StageId } from '@/lib/stages';
import type { WorkflowMode } from '@/lib/workflow';

export type OverlayMode = 'side' | 'tint' | 'opacity' | 'difference' | 'strobe';

// User preferences kept across sessions. Alignment parameters are not stored:
// every session starts from the standard settings of each superimposition.
export const DEFAULT_SETTINGS = {
  theme: 'dark' as 'dark' | 'light',
  overlayMode: 'tint' as OverlayMode,
  calibrationUnit: 'pxmm' as 'pxmm' | 'dpi',
  workflowMode: 'guided' as WorkflowMode,
  singleStage: 'cranialBase' as StageId,
};

export type Settings = typeof DEFAULT_SETTINGS;

export const SETTINGS_STORAGE_KEY = 'anchoralign.settings';

const ALLOWED: { [K in keyof Settings]: readonly Settings[K][] } = {
  theme: ['dark', 'light'],
  overlayMode: ['side', 'tint', 'opacity', 'difference', 'strobe'],
  calibrationUnit: ['pxmm', 'dpi'],
  workflowMode: ['guided', 'single'],
  singleStage: ['cranialBase', 'mandible', 'maxilla'],
};

// Keeps only stored values that match a known key and an allowed value.
export function parseSettings(raw: string | null): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  let stored: unknown;
  try {
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    return settings;
  }
  if (!stored || typeof stored !== 'object') return settings;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = (stored as Record<string, unknown>)[key];
    if ((ALLOWED[key] as readonly unknown[]).includes(value)) (settings as Record<string, unknown>)[key] = value;
  }
  return settings;
}

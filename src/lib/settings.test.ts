import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('stored settings', () => {
  it('falls back to defaults for missing or malformed storage', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and drops unknown keys and options', () => {
    const settings = parseSettings(JSON.stringify({
      theme: 'light',
      overlayMode: 'wipe',
      workflowMode: 'single',
      singleStage: 'maxilla',
      roiRp1Mm: 12,
    }));
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'light', workflowMode: 'single', singleStage: 'maxilla' });
  });
});

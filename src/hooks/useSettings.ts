import { useCallback, useState } from 'react';
import { SETTINGS_STORAGE_KEY, parseSettings, type Settings } from '@/lib/settings';

function readStorage(): string | null {
  try {
    return localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return null;
  }
}

// User settings, persisted in localStorage.
export function useSettings() {
  const [settings, setSettings] = useState(() => parseSettings(readStorage()));
  const update = useCallback((edits: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...edits };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable (private mode); settings then last for the session.
      }
      return next;
    });
  }, []);
  return [settings, update] as const;
}

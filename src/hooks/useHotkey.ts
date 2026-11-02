import { useEffect, useEffectEvent } from 'react';

// Calls `callback` when `key` is pressed, unless focus is in a form control.
export function useHotkey(key: string, callback: () => void, enabled = true) {
  const onHotkey = useEffectEvent(callback);
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== key || target.closest('input, select, textarea, button')) return;
      event.preventDefault();
      onHotkey();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, enabled]);
}

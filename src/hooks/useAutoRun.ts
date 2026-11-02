import { useEffect, useEffectEvent } from 'react';

// Calls `start` once `armed` has stayed true for `delayMs`, leaving the user a
// moment to correct a landmark. Disarming cancels the pending start.
export function useAutoRun(armed: boolean, delayMs: number, start: () => void) {
  const onStart = useEffectEvent(start);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => onStart(), delayMs);
    return () => clearTimeout(timer);
  }, [armed, delayMs]);
}

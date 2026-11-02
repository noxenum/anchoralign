import { useEffect, useState } from 'react';

export function useStrobe(active: boolean) {
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState<'t1' | 't2'>('t1');
  useEffect(() => {
    setFrame('t1');
    setPlaying(true);
  }, [active]);
  useEffect(() => {
    if (!active || !playing) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      timer = undefined;
      if (!document.hidden) timer = setInterval(() => setFrame(value => value === 't1' ? 't2' : 't1'), 333);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [active, playing]);
  return { frame, playing, toggle: () => setPlaying(value => !value) };
}

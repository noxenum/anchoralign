import { useEffect, useState } from 'react';
import { CephEngine } from '@/engine/engineClient';

// One OpenCV worker for the lifetime of the component; null until it is created.
export function useEngine(): CephEngine | null {
  const [engine, setEngine] = useState<CephEngine | null>(null);
  useEffect(() => {
    const instance = new CephEngine();
    setEngine(instance);
    return () => instance.dispose();
  }, []);
  return engine;
}

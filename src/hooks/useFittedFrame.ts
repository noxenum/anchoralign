import { useEffect, useState, type RefObject } from 'react';

// Largest width × height with the given aspect ratio that fits the element,
// updated whenever the element resizes.
export function useFittedFrame(ref: RefObject<HTMLElement | null>, aspect: number) {
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const r = element.getBoundingClientRect();
      if (r.width / r.height > aspect) setFrame({ w: r.height * aspect, h: r.height });
      else setFrame({ w: r.width, h: r.width / aspect });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, aspect]);
  return frame;
}

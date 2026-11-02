import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export type Placement = 'top' | 'bottom' | 'left' | 'right';

const GAP = 6;
const MARGIN = 8;

// Fixed position next to `anchor`, flipped to the other side when it does not
// fit and clamped to the viewport.
function position(anchor: DOMRect, size: { w: number; h: number }, placement: Placement, matchWidth: boolean): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.max(MARGIN, Math.min(x, vw - size.w - MARGIN));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(y, vh - size.h - MARGIN));
  if (placement === 'right' || placement === 'left') {
    const rightFits = anchor.right + GAP + size.w <= vw - MARGIN;
    const leftFits = anchor.left - GAP - size.w >= MARGIN;
    const onRight = placement === 'right' ? rightFits || !leftFits : !leftFits && rightFits;
    return { left: onRight ? anchor.right + GAP : anchor.left - GAP - size.w, top: clampY(anchor.top + anchor.height / 2 - size.h / 2) };
  }
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - size.h;
  const top = placement === 'bottom'
    ? (below + size.h <= vh - MARGIN || above < MARGIN ? below : above)
    : (above >= MARGIN ? above : below);
  const left = matchWidth ? clampX(anchor.left) : clampX(anchor.left + anchor.width / 2 - size.w / 2);
  return { left, top, ...(matchWidth ? { minWidth: anchor.width } : {}) };
}

type PopoverProps = {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  placement?: Placement;
  // Make the popover at least as wide as the anchor and align their left edges.
  matchWidth?: boolean;
  // Close on outside pointer down, Escape, scroll and resize.
  onClose?: () => void;
  className?: string;
  id?: string;
  role?: string;
  children: ReactNode;
};

// Floating layer rendered into the document body, so that it is not clipped by
// scrolling panels.
export function Popover({ anchor, open, placement = 'bottom', matchWidth = false, onClose, className = '', id, role, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open || !anchor.current || !ref.current) return;
    const size = { w: ref.current.offsetWidth, h: ref.current.offsetHeight };
    setStyle(position(anchor.current.getBoundingClientRect(), size, placement, matchWidth));
  }, [open, anchor, placement, matchWidth, children]);

  useEffect(() => {
    if (!open || !onClose) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const onScroll = (event: Event) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open, onClose, anchor]);

  useEffect(() => { if (!open) setStyle({ visibility: 'hidden' }); }, [open]);

  if (!open) return null;
  return createPortal(
    <div ref={ref} id={id} role={role} className={`popover ${className}`} style={{ position: 'fixed', ...style }}>
      {children}
    </div>,
    document.body,
  );
}

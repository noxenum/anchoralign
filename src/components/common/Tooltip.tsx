import { useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Popover, type Placement } from './Popover';

const SHOW_DELAY_MS = 300;

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  placement?: Placement;
  // Wrap a block-level element (e.g. a list row) instead of an inline one.
  block?: boolean;
};

// Shows `content` on hover and keyboard focus. Disabled controls inside still
// show it (see .tip-anchor in styles.css).
export function Tooltip({ content, children, placement = 'top', block = false }: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [open, setOpen] = useState(false);
  const id = useId();

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  if (!content) return <>{children}</>;
  return (
    <span
      ref={anchor}
      className={`tip-anchor ${block ? 'block' : ''}`}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onPointerDown={hide}
    >
      {children}
      <Popover anchor={anchor} open={open} placement={placement} id={id} role="tooltip" className="tooltip">
        {content}
      </Popover>
    </span>
  );
}

// Small info icon that explains the element next to it.
export function InfoTip({ children, placement = 'top' }: { children: ReactNode; placement?: Placement }) {
  return (
    <Tooltip content={children} placement={placement}>
      <span className="info-tip" tabIndex={0} role="img" aria-label="More information">
        <Info size={13} strokeWidth={2} />
      </span>
    </Tooltip>
  );
}

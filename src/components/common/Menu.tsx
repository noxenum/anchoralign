import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover } from './Popover';

export type MenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
};

type MenuProps = {
  label: ReactNode;
  items: MenuItem[];
  disabled?: boolean;
};

// Button that opens a list of actions.
export function Menu({ label, items, disabled }: MenuProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="btn"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <ChevronDown size={14} className="select-chevron" />
      </button>
      <Popover anchor={trigger} open={open} onClose={() => setOpen(false)} className="menu" role="menu">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={item.disabled}
            onClick={() => {
              setOpen(false);
              item.onSelect();
            }}
          >
            {item.icon}
            <span className="menu-label">{item.label}</span>
          </button>
        ))}
      </Popover>
    </>
  );
}

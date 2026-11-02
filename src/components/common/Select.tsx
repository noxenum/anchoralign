import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover } from './Popover';

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  // Second line in the list, e.g. what the option does.
  description?: string;
  icon?: ReactNode;
};

type SelectProps<T extends string> = {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  'aria-label': string;
  disabled?: boolean;
  id?: string;
};

// Dropdown in the app's style: a button and a listbox, operated with mouse or
// keyboard (arrows, Home/End, Enter/Space, Escape).
export function Select<T extends string>({ value, options, onChange, disabled, id, ...aria }: SelectProps<T>) {
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  const openList = () => {
    setHighlight(selectedIndex);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (index: number) => {
    onChange(options[index].value);
    close();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => (open ? setHighlight((i) => Math.min(options.length - 1, i + 1)) : openList()),
      ArrowUp: () => (open ? setHighlight((i) => Math.max(0, i - 1)) : openList()),
      Home: () => open && setHighlight(0),
      End: () => open && setHighlight(options.length - 1),
      Enter: () => (open ? choose(highlight) : openList()),
      ' ': () => (open ? choose(highlight) : openList()),
      Escape: () => open && close(),
      Tab: () => setOpen(false),
    };
    const action = keys[event.key];
    if (!action) return;
    if (event.key !== 'Tab') event.preventDefault();
    action();
  };

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        className={`select ${open ? 'open' : ''}`}
        disabled={disabled}
        aria-label={aria['aria-label']}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${highlight}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        {selected?.icon}
        <span className="select-value">{selected?.label}</span>
        <ChevronDown className="select-chevron" size={14} />
      </button>
      <Popover anchor={trigger} open={open} matchWidth onClose={() => setOpen(false)} className="menu" id={listId} role="listbox">
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={option.value === value}
            className={`menu-item ${index === highlight ? 'highlight' : ''}`}
            onPointerEnter={() => setHighlight(index)}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
          >
            {option.icon}
            <span className="menu-label">
              {option.label}
              {option.description && <span className="menu-description">{option.description}</span>}
            </span>
            {option.value === value && <Check size={14} className="menu-check" />}
          </div>
        ))}
      </Popover>
    </>
  );
}

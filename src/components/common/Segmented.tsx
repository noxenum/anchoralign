import type { ReactNode } from 'react';
import { Tooltip } from './Tooltip';

export type SegmentedOption<T extends string> = {
  value: T;
  label?: string;
  icon?: ReactNode;
  // Shown on hover; also the accessible name of icon-only options.
  tooltip?: string;
  disabled?: boolean;
};

type SegmentedProps<T extends string> = {
  value: T | null;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  'aria-label': string;
  disabled?: boolean;
  // Stretch to the container width.
  fill?: boolean;
};

// A row of mutually exclusive buttons.
export function Segmented<T extends string>({ value, options, onChange, disabled, fill, ...aria }: SegmentedProps<T>) {
  return (
    <div className={`segmented ${fill ? 'fill' : ''}`} role="radiogroup" aria-label={aria['aria-label']}>
      {options.map((option) => {
        const button = (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            aria-label={option.label ? undefined : option.tooltip}
            className={value === option.value ? 'active' : ''}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label && <span>{option.label}</span>}
          </button>
        );
        return option.tooltip
          ? <Tooltip key={option.value} content={option.tooltip}>{button}</Tooltip>
          : button;
      })}
    </div>
  );
}

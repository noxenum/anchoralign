import { useId } from 'react';

type SliderRowProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  digits?: number;
  onChange: (value: number) => void;
};

export function SliderRow({ label, value, min, max, step, unit, digits = 2, onChange }: SliderRowProps) {
  const id = useId();
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-row">
      <label htmlFor={id} className="slider-label">{label}</label>
      <span className="slider-value">{Number(value).toFixed(digits)}{unit && <span className="u">{unit}</span>}</span>
      <input
        id={id}
        type="range"
        min={min} max={max} step={step}
        value={value}
        style={{ ['--fill' as string]: `${percent}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

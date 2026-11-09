import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Ruler, TriangleAlert } from 'lucide-react';
import { Popover } from '@/components/common/Popover';
import { Segmented } from '@/components/common/Segmented';
import { Tooltip } from '@/components/common/Tooltip';
import {
  formatScale, formatScaleValue, fromPxPerMm, IMAGE_KEYS, isUniform, sameScale, sourceLabel, toPxPerMm, UNIT_LABELS,
  type Calibration, type CalibrationUnit, type PixelScale,
} from '@/lib/calibration';
import type { ImageKey } from '@/types';

const UNIT_OPTIONS = [
  { value: 'pxmm', label: 'px/mm' },
  { value: 'dpi', label: 'dpi' },
] as const;

type CalibrationInputProps = {
  calibration: Calibration;
  // Scale of the alignment frame.
  pxPerMm: number;
  unit: CalibrationUnit;
  setUnit: (unit: CalibrationUnit) => void;
  warnings: string[];
  disabled: boolean;
  onSet: (images: readonly ImageKey[], scale: Partial<PixelScale>) => void;
  onCopyT1ToT2: () => void;
  onReset: () => void;
};

// Pixel scale of T1 and T2. One value covers both images in the common case;
// the panel shows and edits each image's x and y separately.
export function CalibrationInput({
  calibration, pxPerMm, unit, setUnit, warnings, disabled, onSet, onCopyT1ToT2, onReset,
}: CalibrationInputProps) {
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const uniform = isUniform(calibration);
  const icon = warnings.length ? <TriangleAlert size={14} /> : <Ruler size={14} />;

  const tooltip = (
    <>
      {IMAGE_KEYS.map((key) => (
        <div key={key}>
          {key.toUpperCase()} · {formatScale(calibration[key].scale, 'pxmm')} · {formatScale(calibration[key].scale, 'dpi')} · {sourceLabel(calibration[key].source)}
        </div>
      ))}
      {warnings.map((warning) => <div key={warning} className="tooltip-warn">{warning}</div>)}
      <div className="mono">Click the arrow to calibrate each image.</div>
    </>
  );

  return (
    <div className="calibration" ref={anchor}>
      <Tooltip content={tooltip} placement="bottom">
        {uniform ? (
          <label className={`field ${warnings.length ? 'warn' : ''}`}>
            {icon}
            <ScaleInput
              aria-label="Pixel scale of T1 and T2"
              value={calibration.t1.scale.x}
              unit={unit}
              disabled={disabled}
              onCommit={(value) => onSet(IMAGE_KEYS, { x: value, y: value })}
            />
          </label>
        ) : (
          <button type="button" className={`field calibration-summary ${warnings.length ? 'warn' : ''}`}
            onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog">
            {icon}
            <span>T1 {formatScaleValue(calibration.t1.scale, unit)} · T2 {formatScaleValue(calibration.t2.scale, unit)}</span>
          </button>
        )}
      </Tooltip>
      <button type="button" className="icon-btn" aria-label="Calibrate each image" aria-expanded={open} aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}>
        <ChevronDown size={14} className="select-chevron" />
      </button>
      <Segmented aria-label="Calibration unit" value={unit} options={UNIT_OPTIONS} onChange={setUnit} />

      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} className="calibration-panel" role="dialog">
        <div className="calibration-panel-h">
          <span>Calibration</span>
          <span className="h-meta">{UNIT_LABELS[unit]}</span>
        </div>
        <div className="calibration-grid">
          <span />
          <span className="col-h">x</span>
          <span className="col-h">y</span>
          <span className="col-h">source</span>
          {IMAGE_KEYS.map((key) => (
            <CalibrationRow key={key} image={key} calibration={calibration} unit={unit} disabled={disabled} onSet={onSet} />
          ))}
        </div>
        <div className="calibration-actions">
          <button type="button" className="btn sm" disabled={disabled || sameScale(calibration.t1.scale, calibration.t2.scale)} onClick={onCopyT1ToT2}>
            Use T1 values for T2
          </button>
          <button type="button" className="btn sm ghost" disabled={disabled} onClick={onReset}>Reset to metadata</button>
        </div>
        <p className="hint">
          All mm values refer to T1 at {formatScale({ x: pxPerMm, y: pxPerMm }, unit)}. T2 is rescaled to it, and T1 is
          resampled when its pixels are not square.
        </p>
        {warnings.length > 0 && (
          <ul className="warn-list">
            {warnings.map((warning) => <li key={warning}><TriangleAlert size={12} />{warning}</li>)}
          </ul>
        )}
      </Popover>
    </div>
  );
}

function CalibrationRow({ image, calibration, unit, disabled, onSet }: {
  image: ImageKey;
  calibration: Calibration;
  unit: CalibrationUnit;
  disabled: boolean;
  onSet: CalibrationInputProps['onSet'];
}) {
  const { scale, source } = calibration[image];
  const name = image.toUpperCase();
  return (
    <>
      <span className="tag">{name}</span>
      {(['x', 'y'] as const).map((axis) => (
        <label key={axis} className="field">
          <ScaleInput aria-label={`${name} pixel scale ${axis}`} value={scale[axis]} unit={unit} disabled={disabled}
            onCommit={(value) => onSet([image], { [axis]: value })} />
        </label>
      ))}
      <span className="calibration-source">{sourceLabel(source)}</span>
    </>
  );
}

type ScaleInputProps = {
  // px/mm, shown and entered in `unit`.
  value: number;
  unit: CalibrationUnit;
  disabled: boolean;
  onCommit: (pxPerMm: number) => void;
  'aria-label': string;
};

// Number field that commits every valid value while typing and shows the
// formatted value again on blur.
function ScaleInput({ value, unit, disabled, onCommit, ...aria }: ScaleInputProps) {
  const format = (pxPerMm: number) => String(Number(fromPxPerMm(pxPerMm, unit).toFixed(unit === 'dpi' ? 1 : 3)));
  const [draft, setDraft] = useState(() => format(value));

  // Re-sync when the value changes from outside (image metadata, unit switch),
  // but not while the typed draft already denotes the current value.
  useEffect(() => {
    const typed = Number(draft);
    const current = fromPxPerMm(value, unit);
    if (!(Number.isFinite(typed) && Math.abs(typed - current) < 1e-9 * Math.max(1, typed))) setDraft(format(value));
  }, [value]);
  useEffect(() => { setDraft(format(value)); }, [unit]);

  return (
    <input
      type="number"
      aria-label={aria['aria-label']}
      min={unit === 'dpi' ? 2.54 : 0.1}
      step={unit === 'dpi' ? 1 : 0.01}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const next = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(next) && next > 0) onCommit(toPxPerMm(next, unit));
      }}
      onBlur={() => setDraft(format(value))}
      disabled={disabled}
    />
  );
}

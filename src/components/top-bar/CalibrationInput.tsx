import { useEffect, useState } from 'react';
import { Ruler, TriangleAlert } from 'lucide-react';
import { Segmented } from '@/components/common/Segmented';
import { Tooltip } from '@/components/common/Tooltip';
import { dpiToPxPerMm, pxPerMmToDpi } from '@/lib/imageResolution';

type CalibrationUnit = 'pxmm' | 'dpi';

const UNIT_OPTIONS = [
  { value: 'pxmm', label: 'px/mm' },
  { value: 'dpi', label: 'dpi' },
] as const;

type CalibrationInputProps = {
  pxPerMm: number;
  unit: CalibrationUnit;
  setUnit: (unit: CalibrationUnit) => void;
  sourceLabel: string;
  warnings: string[];
  disabled: boolean;
  onCommit: (pxPerMm: number) => void;
};

// Pixel scale entry in px/mm or dpi; source and warnings are shown on hover.
export function CalibrationInput({ pxPerMm, unit, setUnit, sourceLabel, warnings, disabled, onCommit }: CalibrationInputProps) {
  const toUnit = (value: number) => (unit === 'dpi' ? pxPerMmToDpi(value) : value);
  const format = (value: number) => String(Number(toUnit(value).toFixed(unit === 'dpi' ? 1 : 3)));
  const [draft, setDraft] = useState(() => format(pxPerMm));

  // Re-sync when the value changes from outside (image metadata, unit switch),
  // but not while the typed draft already denotes the current value.
  useEffect(() => {
    const typed = Number(draft);
    if (!(Number.isFinite(typed) && Math.abs(typed - toUnit(pxPerMm)) < 1e-9 * Math.max(1, typed))) {
      setDraft(format(pxPerMm));
    }
  }, [pxPerMm]);
  useEffect(() => { setDraft(format(pxPerMm)); }, [unit]);

  const other = unit === 'dpi' ? `${pxPerMm.toFixed(3)} px/mm` : `${pxPerMmToDpi(pxPerMm).toFixed(1)} dpi`;
  const tooltip = (
    <>
      <div className="tooltip-title">Calibration · {sourceLabel}</div>
      <div>{other}</div>
      {warnings.map((warning) => <div key={warning} className="tooltip-warn">{warning}</div>)}
    </>
  );

  return (
    <div className="calibration">
      <Tooltip content={tooltip} placement="bottom">
        <label className={`field ${warnings.length ? 'warn' : ''}`}>
          {warnings.length ? <TriangleAlert size={14} /> : <Ruler size={14} />}
          <input
            type="number"
            aria-label="Pixel scale"
            min={unit === 'dpi' ? 2.54 : 0.1}
            step={unit === 'dpi' ? 1 : 0.01}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const next = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(next) && next > 0) {
                onCommit(unit === 'dpi' ? dpiToPxPerMm(next) : next);
              }
            }}
            onBlur={() => setDraft(format(pxPerMm))}
            disabled={disabled}
          />
        </label>
      </Tooltip>
      <Segmented aria-label="Calibration unit" value={unit} options={UNIT_OPTIONS} onChange={setUnit} />
    </div>
  );
}

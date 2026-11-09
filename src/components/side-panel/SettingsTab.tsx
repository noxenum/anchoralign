import { Moon, RotateCcw, Sun } from 'lucide-react';
import { Segmented } from '@/components/common/Segmented';
import { Select } from '@/components/common/Select';
import { SliderRow } from '@/components/common/SliderRow';
import { InfoTip, Tooltip } from '@/components/common/Tooltip';
import { HELP } from '@/components/helpText';
import { ROI2_PRESETS, ROTATION_MODE_OPTIONS, ROT_RANGE_DEG, SCORE_MODE_OPTIONS, TR_RANGE_MM } from '@/constants';
import type { Settings } from '@/lib/settings';
import { isSinglePoint, stageDef, type AlignmentParams, type StageDef, type StageId } from '@/lib/stages';
import type { PreprocessMode } from '@/types';

type SettingsTabProps = {
  // The stage whose settings are shown, which need not be the active stage.
  stage: StageDef;
  params: AlignmentParams;
  onParamsChange: (params: Partial<AlignmentParams>) => void;
  onRestoreDefaults: () => void;
  // Stages to pick from; null when only one stage is in the workflow.
  stageOptions: readonly StageId[] | null;
  onShowStage: (id: StageId) => void;
  settings: Settings;
  updateSettings: (edits: Partial<Settings>) => void;
  preprocessMode: PreprocessMode;
  onPreprocessModeChange: (mode: PreprocessMode) => void;
  preprocessDisabled: boolean;
  claheReady: boolean;
};

const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
  { value: 'light', label: 'Light', icon: <Sun size={14} /> },
] as const;

function isStandard(stage: StageDef, params: AlignmentParams): boolean {
  return (Object.keys(stage.defaults) as (keyof AlignmentParams)[]).every((key) => stage.defaults[key] === params[key]);
}

export function SettingsTab({
  stage, params, onParamsChange, onRestoreDefaults, stageOptions, onShowStage, settings, updateSettings,
  preprocessMode, onPreprocessModeChange, preprocessDisabled, claheReady,
}: SettingsTabProps) {
  const { rotationMode, roi2W, roi2H } = params;
  const singlePoint = isSinglePoint(stage);
  const standard = isStandard(stage, params);
  return (
    <>
      <div className="section">
        <div className="section-h"><span>Preprocessing <InfoTip>{HELP.clahe}</InfoTip></span></div>
        <Segmented
          aria-label="Preprocessing"
          value={preprocessMode}
          onChange={onPreprocessModeChange}
          disabled={preprocessDisabled}
          fill
          options={[
            { value: 'raw', label: 'Raw', tooltip: 'Use the original scans' },
            {
              value: 'clahe',
              label: 'CLAHE',
              tooltip: claheReady ? HELP.clahe : 'Available once both images are loaded',
              disabled: !claheReady,
            },
          ]}
        />
      </div>

      <div className="section">
        <div className="section-h">
          <span>{stageOptions ? 'Superimposition' : stage.name}</span>
          {standard
            ? <span className="h-meta">standard settings</span>
            : (
              <Tooltip content={`Restore the standard settings of the ${stage.name.toLowerCase()} superimposition`}>
                <button className="link-btn warn" onClick={onRestoreDefaults}><RotateCcw size={12} />modified · restore</button>
              </Tooltip>
            )}
        </div>
        {stageOptions && (
          <Segmented
            aria-label="Superimposition settings shown"
            value={stage.id}
            onChange={onShowStage}
            fill
            options={stageOptions.map((id) => ({ value: id, label: stageDef(id).name }))}
          />
        )}
      </div>

      <div className="section">
        <div className="section-h"><span>Alignment</span></div>
        <div className="field-grid">
          <span className="field-label">Scoring <InfoTip>{HELP.score} {params.scoreMode === 'gray' ? HELP.scoreGray : HELP.scoreBlend}</InfoTip></span>
          <Select aria-label="Alignment scoring" value={params.scoreMode} options={SCORE_MODE_OPTIONS}
            onChange={(scoreMode) => onParamsChange({ scoreMode })} />
          <span className="field-label">Rotation <InfoTip>{rotationMode === 'ring' ? HELP.rotationRing : HELP.rotationMoving}</InfoTip></span>
          <Select aria-label="Rotation search" value={rotationMode} options={ROTATION_MODE_OPTIONS}
            onChange={(value) => onParamsChange({ rotationMode: value })} />
        </div>
      </div>

      <div className="section">
        <div className="section-h">
          <span>Regions of interest <InfoTip>{HELP.roi}{singlePoint ? ` ${HELP.singlePoint}` : ''}</InfoTip></span>
        </div>
        <div className="slider-stack">
          {singlePoint ? (
            <SliderRow
              label={`ROI · ${stage.rp1}`}
              value={params.roi1Mm}
              min={6} max={50} step={1}
              unit="mm"
              digits={0}
              onChange={(size) => onParamsChange({ roi1Mm: size, roi2W: size, roi2H: size })}
            />
          ) : (
            <>
              <SliderRow
                label={`ROI₁ · ${stage.rp1}`}
                value={params.roi1Mm}
                min={6} max={50} step={1}
                unit="mm"
                digits={0}
                onChange={(roi1Mm) => onParamsChange({ roi1Mm })}
              />
              <SliderRow
                label={`ROI₂ · ${stage.rp2} · width`}
                value={roi2W}
                min={2} max={50} step={1}
                unit="mm"
                digits={0}
                onChange={(value) => onParamsChange({ roi2W: value })}
              />
              <SliderRow
                label={`ROI₂ · ${stage.rp2} · height`}
                value={roi2H}
                min={6} max={50} step={1}
                unit="mm"
                digits={0}
                onChange={(value) => onParamsChange({ roi2H: value })}
              />
              <div className="chip-row" aria-label="ROI₂ presets">
                {ROI2_PRESETS.map(([w, h]) => (
                  <button
                    key={`${w}x${h}`}
                    className={`chip ${roi2W === w && roi2H === h ? 'active' : ''}`}
                    onClick={() => onParamsChange({ roi2W: w, roi2H: h })}
                  >
                    {w}×{h}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-h"><span>Search <InfoTip>{HELP.steps}</InfoTip></span></div>
        <div className="slider-stack">
          <SliderRow
            label={`Rotation step · ±${ROT_RANGE_DEG}°`}
            value={params.stepDeg}
            min={0.005} max={0.05} step={0.005}
            unit="°"
            digits={3}
            onChange={(stepDeg) => onParamsChange({ stepDeg })}
          />
          <SliderRow
            label={`Translation step · ${TR_RANGE_MM} mm`}
            value={params.stepMm}
            min={0.005} max={0.05} step={0.005}
            unit="mm"
            digits={3}
            onChange={(stepMm) => onParamsChange({ stepMm })}
          />
          <SliderRow
            label="Maximum cycles"
            value={params.maxCycles}
            min={1} max={12} step={1}
            unit=""
            digits={0}
            onChange={(maxCycles) => onParamsChange({ maxCycles })}
          />
        </div>
      </div>

      <div className="section">
        <div className="section-h"><span>Appearance</span></div>
        <Segmented aria-label="Theme" value={settings.theme} options={THEME_OPTIONS} onChange={(theme) => updateSettings({ theme })} fill />
      </div>
    </>
  );
}

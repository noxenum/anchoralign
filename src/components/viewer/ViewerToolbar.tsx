import { Blend, Columns2, Contrast, Diff, Eye, EyeOff, Pause, Play, Zap } from 'lucide-react';
import { InfoTip, Tooltip } from '@/components/common/Tooltip';
import { Segmented } from '@/components/common/Segmented';
import { HELP } from '@/components/helpText';
import { OVERLAY_MODES } from '@/constants';
import { formatScore } from '@/lib/format';
import type { OverlayMode } from '@/lib/settings';
import type { ScoreMode } from '@/types';

const ICONS: Record<OverlayMode, React.ReactNode> = {
  side: <Columns2 size={15} />,
  tint: <Contrast size={15} />,
  opacity: <Blend size={15} />,
  difference: <Diff size={15} />,
  strobe: <Zap size={15} />,
};

type ViewerToolbarProps = {
  stageName: string;
  isOverlayPhase: boolean;
  overlayMode: OverlayMode;
  onOverlayModeChange: (mode: OverlayMode) => void;
  opacity: number;
  onOpacityChange: (value: number) => void;
  showAnnotations: boolean;
  onToggleAnnotations: () => void;
  strobe: { frame: 't1' | 't2'; playing: boolean; toggle: () => void };
  scoreMode: ScoreMode;
  score: number | undefined;
};

export function ViewerToolbar({
  stageName, isOverlayPhase, overlayMode, onOverlayModeChange, opacity, onOpacityChange,
  showAnnotations, onToggleAnnotations, strobe, scoreMode, score,
}: ViewerToolbarProps) {
  const options = OVERLAY_MODES.map(({ id, title }) => ({
    value: id,
    icon: ICONS[id],
    tooltip: title,
    disabled: id !== 'side' && !isOverlayPhase,
  }));
  return (
    <div className="canvas-bar">
      <Segmented
        aria-label="Comparison mode"
        value={isOverlayPhase ? overlayMode : 'side'}
        options={options}
        onChange={(mode) => isOverlayPhase && onOverlayModeChange(mode)}
      />
      <div className="canvas-title">
        <span className="canvas-stage-name">{stageName}</span>
        <span>{isOverlayPhase ? OVERLAY_MODES.find((m) => m.id === overlayMode)?.title.toLowerCase() : 'placing reference points'}</span>
      </div>
      <span className="spacer" />
      {isOverlayPhase && overlayMode === 'opacity' && (
        <label className="opacity-control">
          <Blend size={14} />
          <input type="range" min={0} max={1} step={0.01} value={opacity} aria-label="T2 opacity"
            onChange={e => onOpacityChange(parseFloat(e.target.value))} />
          <span className="mono">{(opacity * 100).toFixed(0)}%</span>
        </label>
      )}
      {isOverlayPhase && overlayMode === 'strobe' && (
        <Tooltip content="Alternates T1 and the aligned T2 every 333 ms">
          <button className="btn ghost" onClick={strobe.toggle}>
            {strobe.playing ? <Pause size={14} /> : <Play size={14} />}
            <span className="mono">{strobe.frame.toUpperCase()}</span>
          </button>
        </Tooltip>
      )}
      {isOverlayPhase && (
        <Tooltip content={showAnnotations ? 'Hide landmarks and ROIs' : 'Show landmarks and ROIs'}>
          <button className="icon-btn" aria-pressed={!showAnnotations} aria-label="Toggle annotations" onClick={onToggleAnnotations}>
            {showAnnotations ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </Tooltip>
      )}
      <div className="meta-pill">
        <span className="dot" />
        <span>{scoreMode === 'gray' ? 'NCC' : 'Score'}</span>
        <span className="mono">{formatScore(score)}</span>
        <InfoTip placement="bottom">{HELP.score} {scoreMode === 'gray' ? HELP.scoreGray : HELP.scoreBlend}</InfoTip>
      </div>
    </div>
  );
}

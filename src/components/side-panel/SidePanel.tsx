import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChartLine, ClipboardList, History, RotateCcw, ScanSearch, SlidersHorizontal } from 'lucide-react';
import { InfoTip } from '@/components/common/Tooltip';
import { HELP } from '@/components/helpText';
import type { Settings } from '@/lib/settings';
import type { AlignmentParams, StageDef } from '@/lib/stages';
import type { StagePhase, WorkflowState } from '@/lib/workflow';
import type { AlignmentResult, ImagePair, IterationEvent, PreAlignSummary, PreprocessMode, RoiConfig } from '@/types';
import { HistoryTab } from './HistoryTab';
import { InspectorTab } from './InspectorTab';
import { IterationsTab } from './IterationsTab';
import { ResultsTab, type ResultsExports } from './ResultsTab';
import { SettingsTab } from './SettingsTab';

type Tab = 'inspect' | 'iterate' | 'history' | 'settings' | 'results';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'settings', label: 'Settings', icon: <SlidersHorizontal size={16} /> },
  { id: 'inspect', label: 'Inspector', icon: <ScanSearch size={16} /> },
  { id: 'iterate', label: 'Iterations', icon: <ChartLine size={16} /> },
  { id: 'history', label: 'History', icon: <History size={16} /> },
  { id: 'results', label: 'Results', icon: <ClipboardList size={16} /> },
];

const PHASE_LABELS: Record<StagePhase, string> = {
  locked: 'waiting for the cranial base',
  placing: 'placing points',
  ready: 'ready to align',
  running: 'aligning…',
  done: 'aligned',
};

type SidePanelProps = {
  workflow: WorkflowState;
  stage: StageDef;
  phase: StagePhase;
  running: boolean;
  allDone: boolean;
  settings: Settings;
  updateSettings: (edits: Partial<Settings>) => void;
  params: AlignmentParams;
  onParamsChange: (params: Partial<AlignmentParams>) => void;
  onRestoreDefaults: () => void;
  roi: RoiConfig;
  preAlign: PreAlignSummary | null;
  iterations: IterationEvent[];
  results: AlignmentResult | null;
  images: ImagePair;
  pxPerMm: number;
  calibrationLabel: string;
  calibrationWarnings: string[];
  preprocessMode: PreprocessMode;
  exports: ResultsExports;
  onReset: () => void;
};

export function SidePanel({
  workflow, stage, phase, running, allDone, settings, updateSettings, params, onParamsChange, onRestoreDefaults,
  roi, preAlign, iterations, results, images, pxPerMm, calibrationLabel, calibrationWarnings, preprocessMode, exports, onReset,
}: SidePanelProps) {
  const [tab, setTab] = useState<Tab>('settings');
  const bodyRef = useRef<HTMLDivElement>(null);
  const { rotationMode } = params;

  // Follow the workflow: the stage's settings while placing, the log while it
  // runs, its result once done and the summary when all stages are done. An
  // open history stays open.
  useEffect(() => {
    if (phase === 'placing') setTab('settings');
    if (phase === 'running') setTab((current) => current === 'history' ? current : 'iterate');
    if (phase === 'done') {
      setTab((current) => current === 'history' ? current : allDone ? 'results' : 'inspect');
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
    }
  }, [stage.id, phase, allDone]);

  return (
    <aside className="side">
      <div className="side-tabs" role="tablist">
        {TABS.map(({ id, label, icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            className={`side-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {icon}<span>{label}</span>
          </button>
        ))}
      </div>

      {tab !== 'results' && (
        <div className="side-header">
          <span className="side-header-name">{stage.name}</span>
          <span className={`phase-badge ${phase}`}>{PHASE_LABELS[phase]}</span>
          {workflow.mode === 'guided' && stage.id !== 'cranialBase' && <InfoTip placement="bottom">{HELP.chained}</InfoTip>}
        </div>
      )}

      <div className="side-body" ref={bodyRef}>
        {tab === 'inspect' && (
          <InspectorTab
            stage={stage}
            chained={workflow.mode === 'guided' && stage.id !== 'cranialBase'}
            roi={roi}
            preAlign={preAlign}
            results={results}
            images={images}
            pxPerMm={pxPerMm}
            calibrationLabel={calibrationLabel}
            calibrationWarnings={calibrationWarnings}
            preprocessMode={preprocessMode}
          />
        )}
        {tab === 'iterate' && (
          <IterationsTab iterations={iterations} preAlign={preAlign} phase={phase} running={running} results={results} />
        )}
        {tab === 'history' && (
          <HistoryTab preAlign={preAlign} iterations={iterations} running={running} phase={phase} rotationMode={rotationMode} />
        )}
        {tab === 'settings' && (
          <fieldset className="settings-fields" disabled={running}>
            <SettingsTab
              stage={stage}
              params={params}
              onParamsChange={onParamsChange}
              onRestoreDefaults={onRestoreDefaults}
              settings={settings}
              updateSettings={updateSettings}
            />
          </fieldset>
        )}
        {tab === 'results' && <ResultsTab workflow={workflow} running={running} exports={exports} />}
      </div>

      <div className="side-foot">
        <button className="btn ghost" disabled={running} onClick={onReset}><RotateCcw size={14} />Reset session</button>
      </div>
    </aside>
  );
}

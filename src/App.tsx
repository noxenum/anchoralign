import { useEffect, useState } from 'react';
import { Crosshair, Download, FileImage, FileSpreadsheet, LoaderCircle, Play, RotateCcw } from 'lucide-react';
import { Menu } from '@/components/common/Menu';
import { Tooltip } from '@/components/common/Tooltip';
import { HELP } from '@/components/helpText';
import { SidePanel } from '@/components/side-panel/SidePanel';
import { StatusBar } from '@/components/status-bar/StatusBar';
import { CalibrationInput } from '@/components/top-bar/CalibrationInput';
import { ImageFileChip } from '@/components/top-bar/ImageFileChip';
import { ToolbarDivider, TopBar } from '@/components/top-bar/TopBar';
import { Viewer } from '@/components/viewer/Viewer';
import { ViewerPrompts } from '@/components/viewer/ViewerPrompts';
import { ViewerToolbar } from '@/components/viewer/ViewerToolbar';
import { WorkflowRail } from '@/components/workflow-rail/WorkflowRail';
import { useHotkey } from '@/hooks/useHotkey';
import { useStrobe } from '@/hooks/useStrobe';
import { useWorkspace } from '@/hooks/useWorkspace';
import { alignmentStatus } from '@/lib/format';
import { isSinglePoint, stageLandmarks } from '@/lib/stages';
import type { StagePhase } from '@/lib/workflow';

const PHASE_LABELS: Record<StagePhase, string> = {
  locked: 'waiting for the cranial base',
  placing: 'placing',
  ready: 'ready',
  running: 'running',
  done: 'done',
};

export default function App() {
  const ws = useWorkspace();
  const { settings, updateSettings, images, stage, phase, calibration, actions, busy } = ws;
  const [opacity, setOpacity] = useState(0.55);
  const strobe = useStrobe(ws.isOverlayPhase && settings.overlayMode === 'strobe');
  useHotkey('Enter', () => actions.runAlignment(), ws.canRun);
  // On the root element, so that tooltips and menus outside .app follow it too.
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);

  const results = stage.result;
  const lastIteration = stage.iterations.at(-1);
  const status = alignmentStatus(results);
  const done = phase === 'done';
  const engineStatus = ws.running ? 'running' : done ? status.label : 'idle';
  const tone = ws.running || (done && status.warn) ? 'run' : done ? 'ok' : 'idle';
  const placing = ws.hasImageGeometry && phase === 'placing' ? ws.activeLandmark : null;
  const stageLabel = phase === 'placing'
    ? `${ws.stageDef.name} · placing ${ws.placedCount} / ${stageLandmarks(ws.stageDef).length}`
    : `${ws.stageDef.name} · ${PHASE_LABELS[phase]}`;

  return (
    <div className="app">
      <TopBar files={<>
        <ImageFileChip label="T1" fileName={images.t1.src ? images.t1.name : null} disabled={busy} confirmRemove={ws.hasWork}
          onFile={(file) => actions.loadImageFile('t1', file)} onRemove={() => actions.removeImage('t1')} />
        <ImageFileChip label="T2" fileName={images.t2.src ? images.t2.name : null} disabled={busy} confirmRemove={ws.hasWork}
          onFile={(file) => actions.loadImageFile('t2', file)} onRemove={() => actions.removeImage('t2')} />
      </>}>
        <CalibrationInput
          pxPerMm={calibration.pxPerMm}
          unit={settings.calibrationUnit}
          setUnit={(calibrationUnit) => updateSettings({ calibrationUnit })}
          sourceLabel={calibration.label}
          warnings={calibration.warnings}
          disabled={busy}
          onCommit={actions.setManualCalibration}
        />
        <ToolbarDivider />
        <Tooltip content={HELP.preAlignment} placement="bottom">
          <button className="btn ghost" disabled={!ws.preAlign || !ws.hasImageGeometry || busy} onClick={actions.usePreAlignment}>
            <Crosshair size={15} />Pre-alignment only
          </button>
        </Tooltip>
        <Menu
          label={<><Download size={15} />Export</>}
          disabled={busy}
          items={[
            { key: 't1', label: 'T1 image (PNG)', icon: <FileImage size={15} />, disabled: !ws.canExportT1, onSelect: actions.exportT1 },
            { key: 't2', label: `Aligned T2 · ${ws.stageDef.name} (PNG)`, icon: <FileImage size={15} />, disabled: !results, onSelect: () => actions.exportAlignedT2(ws.stageId) },
            { key: 'csv', label: 'Results (CSV)', icon: <FileSpreadsheet size={15} />, disabled: !Object.values(ws.workflow.stages).some((s) => s.result), onSelect: actions.exportResults },
          ]}
        />
        <button className="btn primary" disabled={!ws.canRun} onClick={() => actions.runAlignment()}>
          {ws.running ? <LoaderCircle size={15} className="spin" /> : done ? <RotateCcw size={15} /> : <Play size={15} />}
          {done ? 'Re-run alignment' : 'Run alignment'} <span className="kbd">⏎</span>
        </button>
      </TopBar>

      <WorkflowRail
        workflow={ws.workflow}
        running={ws.running}
        onSetMode={actions.setMode}
        onSetActiveStage={actions.setActiveStage}
        onSelectLandmark={actions.selectLandmark}
        onClearLandmark={actions.clearLandmark}
      />

      <main className="main">
        <ViewerToolbar
          stageName={ws.stageDef.name}
          isOverlayPhase={ws.isOverlayPhase}
          overlayMode={settings.overlayMode}
          onOverlayModeChange={(overlayMode) => updateSettings({ overlayMode })}
          opacity={opacity}
          onOpacityChange={setOpacity}
          showAnnotations={ws.showAnnotations}
          onToggleAnnotations={actions.toggleAnnotations}
          strobe={strobe}
          scoreMode={stage.params.scoreMode}
          score={results?.score ?? lastIteration?.score ?? ws.preAlign?.initialScore}
        />
        <Viewer
          images={ws.displayImages}
          points={ws.nativePoints}
          roi={ws.roi}
          pxPerMm={calibration.pxPerMm}
          singlePoint={isSinglePoint(ws.stageDef)}
          isOverlayPhase={ws.isOverlayPhase}
          overlayMode={settings.overlayMode}
          t2Transform={ws.t2Transform}
          showAnnotations={ws.showAnnotations}
          strobeFrame={strobe.frame}
          opacity={opacity}
          placing={placing}
          placementGuide={ws.placementGuide}
          onPlace={actions.placeLandmark}
          onFileDrop={actions.loadImageFile}
        >
          <ViewerPrompts
            stage={ws.stageDef}
            phase={phase}
            hasImages={ws.hasImages}
            hasImageGeometry={ws.hasImageGeometry}
            activeLandmark={ws.activeLandmark}
            error={ws.error}
            preAlign={ws.preAlign}
            iterations={stage.iterations}
            result={results}
            rotationMode={stage.params.rotationMode}
            autoRunArmed={ws.autoRunArmed}
            nextStage={ws.nextStage}
            allDone={ws.allDone}
            onRunNow={() => actions.runAlignment()}
            onCancelAutoRun={actions.cancelAutoRun}
            onContinue={actions.setActiveStage}
          />
        </Viewer>
      </main>

      <SidePanel
        workflow={ws.workflow}
        stage={ws.stageDef}
        phase={phase}
        running={ws.running}
        allDone={ws.allDone}
        settings={settings}
        updateSettings={updateSettings}
        onParamsChange={actions.setParams}
        onRestoreDefaults={actions.restoreDefaults}
        roi={ws.roi}
        preAlign={ws.preAlign}
        iterations={stage.iterations}
        results={results}
        images={images}
        pxPerMm={calibration.pxPerMm}
        calibrationLabel={calibration.label}
        calibrationWarnings={calibration.warnings}
        preprocessMode={ws.preprocessMode}
        onPreprocessModeChange={actions.setPreprocessMode}
        preprocessDisabled={busy}
        claheReady={ws.claheReady}
        exports={{
          exporting: ws.exporting,
          onExportResults: actions.exportResults,
          onExportAllImages: actions.exportAllAlignedT2,
          onExportImage: actions.exportAlignedT2,
        }}
        onReset={() => { if (!ws.running) actions.resetSession(); }}
      />

      <StatusBar
        engineStatus={engineStatus}
        tone={tone}
        stageLabel={stageLabel}
        transform={ws.t2Transform}
        pxPerMm={calibration.pxPerMm}
        roi1Score={results?.roi1Score ?? lastIteration?.roi1Score ?? ws.preAlign?.roi1Score}
        roi2Score={results?.roi2Score ?? lastIteration?.roi2Score ?? ws.preAlign?.roi2Score}
        preprocessMode={ws.preprocessMode}
      />
    </div>
  );
}

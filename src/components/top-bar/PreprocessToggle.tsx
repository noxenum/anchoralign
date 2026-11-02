import { Segmented } from '@/components/common/Segmented';
import { HELP } from '@/components/helpText';
import type { PreprocessMode } from '@/types';

type PreprocessToggleProps = {
  value: PreprocessMode;
  onChange: (mode: PreprocessMode) => void;
  rawDisabled: boolean;
  claheDisabled: boolean;
  claheReady: boolean;
};

export function PreprocessToggle({ value, onChange, rawDisabled, claheDisabled, claheReady }: PreprocessToggleProps) {
  return (
    <Segmented
      aria-label="Preprocessing"
      value={value}
      onChange={onChange}
      options={[
        { value: 'raw', label: 'Raw', tooltip: 'Use the original scans', disabled: rawDisabled },
        {
          value: 'clahe',
          label: 'CLAHE',
          tooltip: claheReady ? HELP.clahe : 'Available once both images are loaded',
          disabled: claheDisabled,
        },
      ]}
    />
  );
}

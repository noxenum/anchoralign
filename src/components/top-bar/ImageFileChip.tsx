import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Tooltip } from '@/components/common/Tooltip';
import { ACCEPTED_IMAGE_TYPES } from '@/constants';

// How long the "Remove?" confirmation stays armed.
const CONFIRM_MS = 3000;

type ImageFileChipProps = {
  label: 'T1' | 'T2';
  // File name of the loaded image, or null before loading.
  fileName: string | null;
  disabled: boolean;
  // Ask for a second click before removing, because work would be lost.
  confirmRemove: boolean;
  onFile: (file: File | undefined) => void;
  onRemove: () => void;
};

const TOOLTIPS = {
  T1: { load: 'Load the first image (T1, reference)', replace: 'Replace the T1 image', remove: 'Remove the T1 image' },
  T2: { load: 'Load the second image (T2)', replace: 'Replace the T2 image', remove: 'Remove the T2 image' },
};

// The image's name in the top bar, which also loads, replaces or removes it.
export function ImageFileChip({ label, fileName, disabled, confirmRemove, onFile, onRemove }: ImageFileChipProps) {
  const input = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const loaded = !!fileName;
  const tips = TOOLTIPS[label];

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const remove = () => {
    if (confirmRemove && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onRemove();
  };

  return (
    <span className={`file-chip-group ${loaded ? 'loaded' : ''} ${confirming ? 'confirming' : ''}`}>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        hidden
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          // Allow selecting the same file again.
          event.target.value = '';
        }}
      />
      <Tooltip content={loaded ? `${tips.replace} · ${fileName}` : tips.load} placement="bottom">
        <button
          type="button"
          className={`file-chip ${loaded ? 'loaded' : ''}`}
          disabled={disabled}
          onClick={() => input.current?.click()}
          aria-label={loaded ? `${tips.replace} (${fileName})` : tips.load}
        >
          <span className="tag">{label}</span>
          <span className="file-name">{loaded ? fileName : 'Load image…'}</span>
          {!loaded && <ImagePlus size={13} className="file-chip-icon" />}
        </button>
      </Tooltip>
      {loaded && (
        <Tooltip content={confirming ? 'Click again to remove; placed points and results are discarded' : tips.remove} placement="bottom">
          <button
            type="button"
            className="file-chip-remove"
            disabled={disabled}
            aria-label={confirming ? `Confirm: ${tips.remove.toLowerCase()}` : tips.remove}
            onClick={remove}
            onBlur={() => setConfirming(false)}
          >
            <X size={12} />
            {confirming && <span>Remove?</span>}
          </button>
        </Tooltip>
      )}
    </span>
  );
}

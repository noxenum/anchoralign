import type { ReactNode } from 'react';
import { Tooltip } from '@/components/common/Tooltip';
import { GitHubLink } from './GitHubLink';

type TopBarProps = {
  // The two image chips (see ImageFileChip).
  files: ReactNode;
  children: ReactNode;
};

// Brand on the left; the image pair and the workspace actions on the right.
export function TopBar({ files, children }: TopBarProps) {
  return (
    <header className="topbar">
      <Tooltip content="Cephalometric superimposition" placement="bottom">
        {/* Two frames superimposed on a shared anchor point; they align on hover. */}
        <div className="brand" aria-label="anchoralign">
          <span className="brand-mark" aria-hidden="true"><span className="brand-pivot" /></span>
          <span className="wordmark" aria-hidden="true">
            <span className="wm-anchor">anchor</span>
            <span className="wm-align" data-text="align">align</span>
          </span>
        </div>
      </Tooltip>
      <GitHubLink />
      <div className="top-actions">
        <div className="crumbs">{files}</div>
        <ToolbarDivider />
        {children}
      </div>
    </header>
  );
}

export function ToolbarDivider() {
  return <div className="vsep" />;
}

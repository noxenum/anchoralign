import type { ReactNode } from 'react';

type PromptProps = {
  // rp1 / rp2: placing that landmark; info: neutral; ok: done; bad: error.
  tone: 'rp1' | 'rp2' | 'info' | 'ok' | 'bad';
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
};

// Floating hint over the image area.
export function Prompt({ tone, title, sub, actions }: PromptProps) {
  return (
    <div className={`prompt ${tone}`} role="status">
      <span className="swatch" />
      <div className="prompt-text">
        <div className="title">{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="prompt-actions">{actions}</div>}
    </div>
  );
}

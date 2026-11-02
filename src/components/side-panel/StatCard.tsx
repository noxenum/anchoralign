import { InfoTip } from '@/components/common/Tooltip';

type StatCardProps = {
  label: string;
  value: string;
  unit?: string;
  tone?: 'ok';
  info?: string;
  // Span the full width of a two-column grid.
  wide?: boolean;
};

// Large figure with a caption, e.g. the rotation of a result.
export function StatCard({ label, value, unit, tone, info, wide }: StatCardProps) {
  return (
    <div className={`results-card ${wide ? 'wide' : ''}`}>
      <div className="lbl">{label}{info && <InfoTip>{info}</InfoTip>}</div>
      <div className={`big ${tone ?? ''}`}>{value}{unit && <span className="u">{unit}</span>}</div>
    </div>
  );
}

// Sparkline of the alignment score over the iterations. `compact` drops the
// axis labels and the current value for small summary cards.
export function ScoreChart({ scores, compact = false }: { scores: number[]; compact?: boolean }) {
  const W = 100, H = 60;
  const padL = 6, padR = 6, padT = 8, padB = 6;
  const finiteScores = scores.filter(Number.isFinite);
  const rawMin = finiteScores.length ? Math.min(...finiteScores) : 0;
  const rawMax = finiteScores.length ? Math.max(...finiteScores) : 1;
  const span = Math.max(0.02, rawMax - rawMin);
  const minS = Math.max(-1, rawMin - span * 0.2);
  const maxS = Math.min(1, rawMax + span * 0.2);
  const scale = Math.max(0.001, maxS - minS);
  const n = Math.max(scores.length, 2);
  const points = scores.map((s, i) => {
    const x = padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
    const y = padT + (1 - Math.max(0, Math.min(1, (s - minS) / scale))) * (H - padT - padB);
    return [x, y];
  });
  const path = points.length ? 'M ' + points.map(p => p.join(' ')).join(' L ') : '';
  const fillPath = points.length
    ? path + ` L ${points[points.length-1][0]} ${H - padB} L ${points[0][0]} ${H - padB} Z`
    : '';
  const last = scores[scores.length - 1];

  return (
    <div className={`score-chart ${compact ? 'compact' : ''}`} role="img" aria-label={`Score over ${scores.length} steps, last ${last?.toFixed(4) ?? '—'}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
        <g className="grid">
          {[minS, minS + scale / 2, maxS].map((v) => {
            const y = padT + (1 - (v - minS) / scale) * (H - padT - padB);
            return <line key={v} x1={padL} y1={y} x2={W - padR} y2={y} />;
          })}
        </g>
        {points.length > 1 && <path className="score-fill" d={fillPath} />}
        {points.length > 1 && <path className="score-line" d={path} />}
        {points.length > 0 && (
          <circle className="score-dot" cx={points[points.length-1][0]} cy={points[points.length-1][1]} r="1.2" />
        )}
      </svg>
      {!compact && (
        <>
          <div className="axis-l">{maxS.toFixed(2)}</div>
          <div className="axis-r">{minS.toFixed(2)}</div>
          <div className="score-now">{last != null ? last.toFixed(4) : '—'}</div>
        </>
      )}
    </div>
  );
}

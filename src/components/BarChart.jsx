import { useState } from 'react';

// Single-series bar chart drawn as plain SVG (no chart library, works offline).
// Rounded tops anchored to the baseline, recessive grid, hover tooltip on every bar,
// and an optional dashed reference line (e.g. last period's average) labeled directly.
export default function BarChart({ data, reference, referenceLabel, valueLabel = 'check-ins', height = 240 }) {
  const [hover, setHover] = useState(null);
  const W = 760;
  const H = height;
  const pad = { top: 16, right: 12, bottom: 28, left: 36 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const max = Math.max(1, reference || 0, ...data.map((d) => d.count));
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : 10;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);

  const slot = plotW / data.length;
  const gap = Math.max(2, slot * 0.28);
  const barW = Math.max(2, slot - gap);
  const y = (v) => pad.top + plotH - (v / top) * plotH;
  const labelEvery = data.length > 15 ? 5 : data.length > 8 ? 2 : 1;

  const bar = (x, v) => {
    const h = (v / top) * plotH;
    if (h <= 0) return '';
    const r = Math.min(4, barW / 2, h);
    const b = pad.top + plotH;
    return `M${x},${b} V${b - h + r} Q${x},${b - h} ${x + r},${b - h} H${x + barW - r} Q${x + barW},${b - h} ${x + barW},${b - h + r} V${b} Z`;
  };

  const tip = hover != null ? data[hover] : null;

  return (
    <div>
      {reference != null && reference > 0 && (
        <p className="chart-key">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" /></svg>
          {referenceLabel}
        </p>
      )}
      <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bar chart of ${valueLabel}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-base' : 'chart-grid'} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-axis">{t}</text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = pad.left + i * slot + gap / 2;
          return (
            <g key={i}>
              <path d={bar(x, d.count)} className={'chart-bar' + (hover === i ? ' is-hover' : '')} />
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="chart-axis">{d.label}</text>
              )}
              <rect
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${d.long}: ${d.count} ${valueLabel}`}
              />
            </g>
          );
        })}

        {reference != null && reference > 0 && (
          <g className="chart-ref" pointerEvents="none">
            <line x1={pad.left} x2={W - pad.right} y1={y(reference)} y2={y(reference)} />
          </g>
        )}
      </svg>

      {tip && (
        <div
          className="chart-tip"
          style={{ left: `${((pad.left + hover * slot + slot / 2) / W) * 100}%`, top: `${(y(tip.count) / H) * 100}%` }}
        >
          <strong>{tip.count}</strong> {tip.count === 1 ? valueLabel.replace(/s$/, '') : valueLabel}
          <span>{tip.long}</span>
        </div>
      )}
      </div>
    </div>
  );
}

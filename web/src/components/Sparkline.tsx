/** Inline SVG sparkline; nulls break the line. Colour comes from the current text colour. */
export function Sparkline({ values, width = 120, height = 28, label }: { values: (number | null)[]; width?: number; height?: number; label?: string }) {
  const vals = values.filter((v): v is number => v != null);
  if (vals.length < 2) return <span className="muted">–</span>;
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const lastI = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
  return (
    <svg width={width} height={height} role="img" aria-label={label} style={{ color: "var(--s1)", display: "block" }}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lastI)} cy={y(values[lastI]!)} r="2.5" fill="currentColor" />
    </svg>
  );
}

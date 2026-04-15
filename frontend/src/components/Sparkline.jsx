export default function Sparkline({ data = [], width = 600, height = 60, stroke = '#10b981', fill = 'rgba(16,185,129,0.12)' }) {
  if (!data.length) return <div className="h-full grid place-items-center text-xs text-slate-500">no data</div>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => [i * step, height - ((v - min) / range) * (height - 4) - 2]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L${width} ${height} L0 ${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
      <path d={area} fill={fill} />
      <path d={path} stroke={stroke} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export default function HealthRing({ score = 0, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#0ea5e9' : score >= 40 ? '#f59e0b' : '#f43f5e';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(30 41 59)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

// GitHub-style 90d activity heatmap.
export default function Heatmap({ series = [] }) {
  if (!series.length) return null;
  const max = Math.max(...series.map(s => s.count), 1);
  // Organize into weeks (cols) x days (rows) ending today
  const days = series.slice(-91); // ~13 weeks
  const weeks = [];
  let week = [];
  // pad start so first week aligns to Sunday (optional)
  days.forEach(d => {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  });
  if (week.length) weeks.push(week);
  return (
    <div className="flex gap-[3px]">
      {weeks.map((w, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {w.map((d, di) => {
            const intensity = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max) * 4));
            const bg = ['bg-ink-800', 'bg-emerald-900', 'bg-emerald-700', 'bg-emerald-500', 'bg-emerald-400'][intensity];
            return (
              <div key={di} title={`${d.date}: ${d.count}`}
                className={`h-[10px] w-[10px] rounded-sm ${bg} transition-colors`} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

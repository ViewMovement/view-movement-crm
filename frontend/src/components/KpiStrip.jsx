import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import Sparkline from './Sparkline.jsx';

export default function KpiStrip() {
  const [m, setM] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api.metrics().then(setM).catch(() => {});
  }, []);

  if (!m) return null;
  const { kpis, velocity_series } = m;
  const spark = velocity_series.slice(-28).map(v => v.count);
  const deltaPos = (kpis.tps_delta_pct ?? 0) >= 0;

  return (
    <section className="mb-8 grid grid-cols-2 md:grid-cols-5 gap-3">
      <MiniKpi label="Active" value={kpis.active_clients} onClick={() => nav('/clients')} />
      <MiniKpi label="Avg health" value={kpis.avg_health} suffix="/100" tone={tone(kpis.avg_health)} onClick={() => nav('/reports')} />
      <MiniKpi label="This week" value={kpis.tps_this_week} sub={kpis.tps_delta_pct == null ? 'touchpoints' : `${deltaPos ? '+' : ''}${kpis.tps_delta_pct}%`} tone={deltaPos ? 'good' : 'warn'} onClick={() => nav('/activity')} />
      <MiniKpi label="Open flags" value={kpis.open_flags} tone={kpis.open_flags === 0 ? 'good' : 'warn'} onClick={() => nav('/flags')} />
      <div onClick={() => nav('/reports')}
        className="cursor-pointer rounded-xl border border-ink-800 bg-ink-900/40 px-3 py-2.5 hover:border-ink-600 transition flex flex-col justify-between overflow-hidden">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Velocity · 28d</div>
        <div className="h-8 -mb-1"><Sparkline data={spark} height={32} stroke="#10b981" fill="rgba(16,185,129,0.15)" /></div>
      </div>
    </section>
  );
}

function MiniKpi({ label, value, suffix, sub, tone = 'default', onClick }) {
  const cls = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-slate-100';
  return (
    <button onClick={onClick}
      className="text-left rounded-xl border border-ink-800 bg-ink-900/40 px-3 py-2.5 hover:border-ink-600 transition">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${cls} mt-0.5`}>
        {value}{suffix && <span className="text-[11px] text-slate-500 ml-0.5">{suffix}</span>}
      </div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </button>
  );
}

function tone(s) { if (s >= 80) return 'good'; if (s < 60) return 'warn'; return 'default'; }

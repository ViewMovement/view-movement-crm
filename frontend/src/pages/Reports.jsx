import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Sparkline from '../components/Sparkline.jsx';
import HealthRing from '../components/HealthRing.jsx';
import Heatmap from '../components/Heatmap.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';

export default function Reports() {
  const [m, setM] = useState(null);
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const openClient = (id) => setOpenId(id);

  useEffect(() => {
    (async () => {
      try {
        const [metrics, d] = await Promise.all([api.metrics(), api.execDigest()]);
        setM(metrics); setDigest(d);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <SkeletonReports />;
  if (!m) return <div className="text-slate-400">Metrics unavailable.</div>;

  const { kpis, health_distribution, cohorts, velocity_series, touchpoints_by_type_30d, top_at_risk } = m;
  const healthyPct = total(health_distribution) ? Math.round(health_distribution.healthy / total(health_distribution) * 100) : 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Reports</div>
          <h1 className="text-3xl font-semibold tracking-tight">Client Success — at a glance</h1>
          <div className="text-sm text-slate-400 mt-1">Updated {new Date(m.generated_at).toLocaleString()}</div>
        </div>
        <button onClick={copyExec(digest)}
          className="px-3 py-2 rounded-md border border-ink-700 bg-ink-900 hover:bg-ink-800 text-sm text-slate-200 transition">
          Copy exec summary
        </button>
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Active clients" value={kpis.active_clients} sub={`${kpis.new_this_month} new this month`} />
        <Kpi label="Avg. health" value={kpis.avg_health} suffix="/ 100" sub={`${healthyPct}% healthy`} tone={tone(kpis.avg_health)} />
        <Kpi label="Touchpoints this week" value={kpis.tps_this_week} sub={kpis.tps_delta_pct == null ? '—' : `${kpis.tps_delta_pct >= 0 ? '+' : ''}${kpis.tps_delta_pct}% vs last week`} tone={kpis.tps_delta_pct >= 0 ? 'good' : 'warn'} />
        <Kpi label="Open flags" value={kpis.open_flags} sub={`${kpis.resolved_this_week} resolved this week`} tone={kpis.open_flags === 0 ? 'good' : 'warn'} />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Save rate" value={kpis.save_rate == null ? '—' : `${kpis.save_rate}%`} sub={`${kpis.saves_won} won · ${kpis.saves_lost} lost`} tone={kpis.save_rate >= 50 ? 'good' : 'warn'} />
        <Kpi label="Median resolve" value={kpis.median_resolve_hours == null ? '—' : `${kpis.median_resolve_hours}h`} sub="flags opened → resolved" />
        <Kpi label="Churned (90d)" value={kpis.churned_recent} sub="recent departures" tone={kpis.churned_recent === 0 ? 'good' : 'warn'} />
        <Kpi label="Net change (wk)" value={digest?.summary ? signed(digest.summary.net_change) : '—'} sub={digest?.summary ? `${digest.summary.new_this_week} in · ${digest.summary.churned_this_week} out` : ''} tone={digest?.summary?.net_change >= 0 ? 'good' : 'warn'} />
      </section>

      {/* Velocity + health distribution */}
      <section className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 p-5 rounded-xl border border-ink-800 bg-ink-900/40">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-medium text-slate-200">Touchpoint velocity · 90 days</div>
            <div className="text-xs text-slate-500">{velocity_series.reduce((a, b) => a + b.count, 0)} total</div>
          </div>
          <Sparkline data={velocity_series.map(v => v.count)} height={100} stroke="#10b981" fill="rgba(16,185,129,0.12)" />
          <div className="mt-3 -mx-1">
            <Heatmap series={velocity_series} />
          </div>
        </div>
        <div className="p-5 rounded-xl border border-ink-800 bg-ink-900/40">
          <div className="font-medium text-slate-200 mb-4">Health distribution</div>
          <div className="space-y-2">
            <HealthBar label="Healthy" count={health_distribution.healthy} total={total(health_distribution)} color="bg-emerald-500" />
            <HealthBar label="Watch"    count={health_distribution.watch}    total={total(health_distribution)} color="bg-sky-500" />
            <HealthBar label="At-risk"  count={health_distribution.at_risk}  total={total(health_distribution)} color="bg-amber-500" />
            <HealthBar label="Critical" count={health_distribution.critical} total={total(health_distribution)} color="bg-rose-500" />
          </div>
          <div className="mt-5 pt-4 border-t border-ink-800">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Cohorts</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <CohortStat label="New" value={cohorts.new} />
              <CohortStat label="Active · happy" value={cohorts.active_happy} />
              <CohortStat label="Hands-off" value={cohorts.active_hands_off} />
              <CohortStat label="Cancelling" value={cohorts.cancelling} tone="warn" />
            </div>
          </div>
        </div>
      </section>

      {/* At-risk + Touchpoint mix */}
      <section className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 p-5 rounded-xl border border-ink-800 bg-ink-900/40">
          <div className="font-medium text-slate-200 mb-4">Top at-risk clients</div>
          <div className="space-y-2">
            {top_at_risk.length === 0 && <div className="text-sm text-slate-500">No at-risk clients — everyone's healthy.</div>}
            {top_at_risk.map(c => (
              <button key={c.id} onClick={() => openClient?.(c.id)}
                className="w-full flex items-center gap-4 p-3 rounded-lg border border-ink-800 bg-ink-950/40 hover:bg-ink-800 transition text-left">
                <HealthRing score={c.score} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 capitalize">{c.band.replace('_', ' ')}</div>
                </div>
                <div className="text-xs text-slate-500">Open →</div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-xl border border-ink-800 bg-ink-900/40">
          <div className="font-medium text-slate-200 mb-4">Touchpoint mix · 30d</div>
          <div className="space-y-2">
            {Object.entries(touchpoints_by_type_30d).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <TypeRow key={type} type={type} count={count} max={Math.max(...Object.values(touchpoints_by_type_30d), 1)} />
            ))}
            {Object.keys(touchpoints_by_type_30d).length === 0 && <div className="text-sm text-slate-500">No touchpoints logged in 30 days.</div>}
          </div>
        </div>
      </section>

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
      {digest && (
        <section className="p-5 rounded-xl border border-ink-800 bg-ink-900/40">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-medium text-slate-200">Executive summary · week ending {digest.week_ending}</div>
            <button onClick={copyExec(digest)} className="text-xs text-slate-400 hover:text-slate-200">Copy</button>
          </div>
          <pre className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">{execText(digest)}</pre>
        </section>
      )}
    </div>
  );
}

// ---------- Sub-components ----------
function Kpi({ label, value, suffix, sub, tone = 'default' }) {
  const toneClass = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-slate-100';
  return (
    <div className="p-4 rounded-xl border border-ink-800 bg-ink-900/40">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}{suffix && <span className="text-sm text-slate-500 ml-1">{suffix}</span>}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function HealthBar({ label, count, total, color }) {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm mb-1">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-500 tabular-nums">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-ink-800 overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CohortStat({ label, value, tone }) {
  return (
    <div className="flex justify-between items-baseline px-2 py-1.5 rounded bg-ink-950/60">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className={`tabular-nums font-medium ${tone === 'warn' ? 'text-amber-400' : 'text-slate-200'}`}>{value}</span>
    </div>
  );
}

function TypeRow({ type, count, max }) {
  const pct = (count / max) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-300 capitalize">{type.replace(/_/g, ' ')}</span>
        <span className="text-slate-500 tabular-nums">{count}</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden">
        <div className="h-full bg-emerald-500/80" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SkeletonReports() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 w-80 bg-ink-800 rounded" />
      <div className="grid grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-ink-900 rounded-xl border border-ink-800" />)}</div>
      <div className="h-64 bg-ink-900 rounded-xl border border-ink-800" />
    </div>
  );
}

// ---------- Helpers ----------
function total(d) { return (d.healthy || 0) + (d.watch || 0) + (d.at_risk || 0) + (d.critical || 0); }
function tone(score) { if (score >= 80) return 'good'; if (score < 60) return 'warn'; return 'default'; }
function signed(n) { return n > 0 ? `+${n}` : `${n}`; }
function execText(d) {
  const s = d.summary;
  return `Week ending ${d.week_ending}
• Active clients: ${s.active_clients} (${signed(s.net_change)} net this week)
• New: ${s.new_this_week} · Churned: ${s.churned_this_week}
• Outreach: ${s.looms_sent} Looms sent, ${s.calls_offered} calls offered, ${s.calls_completed} completed
• Situations: ${s.flags_raised} raised, ${s.flags_resolved} resolved
• Save plans: ${s.save_plans_started} started, ${s.save_plans_won} won`;
}
function copyExec(digest) {
  return () => {
    if (!digest) return;
    navigator.clipboard.writeText(execText(digest));
  };
}

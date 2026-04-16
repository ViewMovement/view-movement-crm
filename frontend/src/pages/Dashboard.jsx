import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../lib/api.js';
import TodaysActions from '../components/TodaysActions.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { TabIntro, StatusDot } from '../components/primitives.jsx';
import { fmtMRR, sumMRR } from '../lib/format.js';

// Executive snapshot. Top: revenue KPIs. Middle: today's actions.
// Bottom: largest accounts at risk (dollar-weighted triage).
export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [today, setToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    const [c, t] = await Promise.all([api.listClients(), api.todayActions()]);
    setClients(c); setToday(t); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const all = clients || [];
    const active = all.filter(c => c.status !== 'churned' && c.cohort !== 'churned');
    const activeMRR = sumMRR(active);
    const atRiskClients = active.filter(c => c.status === 'red' || c.cohort === 'cancelling');
    const watchClients = active.filter(c => c.status === 'yellow');
    const onboardingClients = active.filter(c => c.cohort === 'new');
    const healthyClients = active.filter(c => c.status === 'green' && c.cohort !== 'new' && c.cohort !== 'cancelling');
    const atRiskMRR = sumMRR(atRiskClients);
    const watchMRR = sumMRR(watchClients);
    const onboardingMRR = sumMRR(onboardingClients);
    const healthyMRR = sumMRR(healthyClients);

    // Concentration risk: any single client > 10% of active MRR
    const concentration = activeMRR
      ? active.filter(c => (Number(c.mrr)||0) / activeMRR > 0.08)
          .sort((a,b) => (Number(b.mrr)||0) - (Number(a.mrr)||0))
      : [];

    // Net change this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const newThisMonth = all.filter(c => new Date(c.created_at).getTime() >= monthStart && c.status !== 'churned').length;
    const churnedThisMonth = all.filter(c => c.status === 'churned' && new Date(c.updated_at || c.created_at).getTime() >= monthStart).length;

    // Top at-risk by dollar value (what should I save first)
    const topAtRisk = [...atRiskClients]
      .sort((a, b) => (Number(b.mrr)||0) - (Number(a.mrr)||0))
      .slice(0, 6);

    return { active, activeMRR, atRiskClients, atRiskMRR, watchClients, watchMRR, onboardingClients, onboardingMRR, healthyClients, healthyMRR, concentration, newThisMonth, churnedThisMonth, topAtRisk };
  }, [clients]);

  if (loading) return <div className="text-slate-400">Loading dashboard…</div>;

  const pctAtRisk = stats.activeMRR ? (stats.atRiskMRR / stats.activeMRR) * 100 : 0;

  return (
    <div className="space-y-8">
      <TabIntro id="dashboard" title="Executive Dashboard">
        The bird's-eye view of the business. Top row is your real revenue picture — Active MRR, dollars at risk, and net client movement this month. Below that is what needs your attention today, dollar-weighted. If something looks off here, start in Triage.
      </TabIntro>

      {/* KPI Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI
          label="Active MRR"
          value={fmtMRR(stats.activeMRR, { compact: true })}
          sub={`${stats.active.length} paying clients`}
          tone="emerald" />
        <KPI
          label="At-Risk MRR"
          value={fmtMRR(stats.atRiskMRR, { compact: true })}
          sub={`${stats.atRiskClients.length} accounts · ${pctAtRisk.toFixed(0)}% of book`}
          tone={pctAtRisk > 15 ? 'rose' : pctAtRisk > 7 ? 'amber' : 'slate'} />
        <KPI
          label="Onboarding"
          value={fmtMRR(stats.onboardingMRR, { compact: true })}
          sub={`${stats.onboardingClients.length} clients ramping`}
          tone="sky" />
        <KPI
          label="Net this month"
          value={`${stats.newThisMonth - stats.churnedThisMonth >= 0 ? '+' : ''}${stats.newThisMonth - stats.churnedThisMonth}`}
          sub={`${stats.newThisMonth} new · ${stats.churnedThisMonth} churned`}
          tone={stats.newThisMonth >= stats.churnedThisMonth ? 'emerald' : 'rose'} />
      </section>

      {/* Health mix bar */}
      <section>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Revenue by health</div>
        <HealthBar
          segments={[
            { label: 'Healthy', value: stats.healthyMRR, color: 'bg-emerald-500', count: stats.healthyClients.length },
            { label: 'Onboarding', value: stats.onboardingMRR, color: 'bg-sky-500', count: stats.onboardingClients.length },
            { label: 'Watch', value: stats.watchMRR, color: 'bg-amber-500', count: stats.watchClients.length },
            { label: 'At Risk', value: stats.atRiskMRR, color: 'bg-rose-500', count: stats.atRiskClients.length }
          ]}
          total={stats.activeMRR}
        />
      </section>

      {/* Top at-risk accounts (dollar-weighted) */}
      {stats.topAtRisk.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold">Save first — highest $ at risk</h2>
            <span className="text-xs text-slate-500">Ordered by MRR</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {stats.topAtRisk.map(c => (
              <button key={c.id} onClick={() => setOpenId(c.id)}
                className="text-left rounded-lg border border-ink-800 bg-ink-900/40 hover:bg-ink-900 hover:border-ink-700 transition p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusDot status={c.status} />
                    <span className="font-medium text-slate-100 truncate">{c.name}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 capitalize">{c.cohort?.replace(/_/g, ' ') || '—'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums text-rose-300">{fmtMRR(c.mrr, { compact: true })}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">/mo</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Concentration risk */}
      {stats.concentration.length > 0 && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Concentration risk · single accounts &gt; 8% of book</div>
          <div className="flex gap-2 flex-wrap">
            {stats.concentration.map(c => (
              <button key={c.id} onClick={() => setOpenId(c.id)}
                className="px-3 py-1.5 rounded-full border border-ink-700 bg-ink-900 hover:bg-ink-800 text-sm transition">
                <span className="text-slate-200">{c.name}</span>
                <span className="text-slate-500 ml-2">{fmtMRR(c.mrr, { compact: true })}</span>
                <span className="text-slate-600 ml-1 text-xs">· {((Number(c.mrr)||0) / stats.activeMRR * 100).toFixed(0)}%</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Today's Actions */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Today's Actions</h2>
            <p className="text-sm text-slate-400">
              {today.length
                ? `${today.length} item${today.length === 1 ? '' : 's'} need attention, prioritized by status and urgency.`
                : 'You are clear for today.'}
            </p>
          </div>
        </div>
        <TodaysActions items={today} onChange={load} />
      </section>

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function KPI({ label, value, sub, tone = 'slate' }) {
  const toneCls = {
    emerald: 'text-emerald-300',
    sky: 'text-sky-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
    slate: 'text-slate-200'
  }[tone] || 'text-slate-200';
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${toneCls}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

function HealthBar({ segments, total }) {
  if (!total) return <div className="text-sm text-slate-500">No revenue yet.</div>;
  return (
    <div>
      <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-ink-900 border border-ink-800">
        {segments.map(s => {
          const pct = (s.value / total) * 100;
          if (pct <= 0) return null;
          return <div key={s.label} className={s.color} style={{ width: pct + '%' }} title={`${s.label}: ${fmtMRR(s.value)}`} />;
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-slate-400">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
            <span>{s.label}</span>
            <span className="text-slate-500 tabular-nums">{fmtMRR(s.value, { compact: true })}</span>
            <span className="text-slate-600">· {s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

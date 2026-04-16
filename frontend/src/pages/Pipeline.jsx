import { useMemo, useState } from 'react';
import { useData } from '../lib/data.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Empty, SectionHeader, Skeleton, StatusDot, statusMeta, TabIntro } from '../components/primitives.jsx';
import { fmtDate, fmtMRR, sumMRR } from '../lib/format.js';
import { useRole } from '../lib/role.jsx';

export default function Pipeline() {
  const { clients, loading } = useData();
  const [openId, setOpenId] = useState(null);
  const { canSeeFinancials } = useRole();

  const { onboarding, active, churned } = useMemo(() => {
    const cutoff = Date.now() - 14 * 86400000;
    const onboarding = [], active = [], churned = [];
    for (const c of clients || []) {
      if (c.status === 'churned') {
        churned.push(c);
      } else if (c.cohort === 'new' || c.onboarding_flag || (!c.onboarding_call_completed && new Date(c.created_at).getTime() > cutoff)) {
        onboarding.push(c);
      } else {
        active.push(c);
      }
    }
    onboarding.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    active.sort((a, b) => a.name.localeCompare(b.name));
    churned.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    return { onboarding, active, churned };
  }, [clients]);

  if (loading) return <Skeleton rows={8} className="h-14 w-full" />;

  return (
    <>
      <TabIntro id="pipeline" title="What is this?">
        The full lifecycle view. <b>New & Onboarding</b> shows clients still going through setup — Typeform signups land here automatically. <b>Active</b> shows all clients who are past onboarding and currently receiving service. <b>Churned</b> shows recently cancelled clients.
      </TabIntro>
      <SectionHeader
        title="Pipeline"
        subtitle={`${onboarding.length} onboarding · ${active.length} active · ${churned.length} churned`}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <Column
          title="New & Onboarding"
          count={onboarding.length}
          mrr={canSeeFinancials ? sumMRR(onboarding) : null}
          accent="emerald"
          empty="Nobody new. New signups land here automatically from Typeform.">
          {onboarding.map(c => (
            <Card key={c.id} client={c} onOpen={() => setOpenId(c.id)}
              metaLabel={`Added ${fmtDate(c.created_at)}`} />
          ))}
        </Column>

        <Column
          title="Active"
          count={active.length}
          mrr={canSeeFinancials ? sumMRR(active) : null}
          accent="blue"
          empty="No active clients yet.">
          {active.map(c => (
            <Card key={c.id} client={c} onOpen={() => setOpenId(c.id)}
              metaLabel={c.email || c.company || '—'} />
          ))}
        </Column>

        <Column
          title="Churned"
          count={churned.length}
          mrr={canSeeFinancials ? sumMRR(churned) : null}
          accent="slate"
          empty="No churn to show. That's the dream.">
          {churned.map(c => (
            <Card key={c.id} client={c} onOpen={() => setOpenId(c.id)}
              metaLabel={`Churned ${fmtDate(c.updated_at || c.created_at)}`} />
          ))}
        </Column>
      </div>

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function Column({ title, count, mrr, accent, empty, children }) {
  const dot = accent === 'emerald' ? 'bg-emerald-400' : accent === 'blue' ? 'bg-blue-400' : 'bg-slate-500';
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          <h3 className="text-sm font-medium tracking-tight">{title}</h3>
        </div>
        <div className="flex items-center gap-3">
          {mrr ? <span className="text-xs font-medium tabular-nums text-slate-400">{fmtMRR(mrr, { compact: true })}/mo</span> : null}
          <span className="text-xs text-slate-500 tabular-nums">{count}</span>
        </div>
      </div>
      {count === 0 ? <Empty icon="—" title={empty} /> : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">{children}</div>
      )}
    </section>
  );
}

function Card({ client, metaLabel, onOpen }) {
  const sm = statusMeta(client.status);
  const { canSeeFinancials } = useRole();
  return (
    <div onClick={onOpen}
         className="card p-4 cursor-pointer hover:bg-ink-800 transition flex items-center gap-3">
      <StatusDot status={client.status} label={false} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{client.name}</div>
        <div className="text-xs text-slate-500 truncate">{metaLabel}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {canSeeFinancials && client.mrr ? <span className="text-[10px] tabular-nums text-slate-500">{fmtMRR(client.mrr, { compact: true })}</span> : null}
        <span className={`text-[11px] tracking-wide ${sm.cls || 'text-slate-500'}`}>{sm.label}</span>
      </div>
    </div>
  );
}

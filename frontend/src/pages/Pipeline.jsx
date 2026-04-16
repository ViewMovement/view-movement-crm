import { useMemo, useState } from 'react';
import { useData } from '../lib/data.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Empty, SectionHeader, Skeleton, StatusDot, statusMeta, TabIntro } from '../components/primitives.jsx';
import { fmtDate, fmtMRR, sumMRR } from '../lib/format.js';

export default function Pipeline() {
  const { clients, loading } = useData();
  const [openId, setOpenId] = useState(null);

  const { onboarding, churned } = useMemo(() => {
    const cutoff = Date.now() - 14 * 86400000;
    const onboarding = [], churned = [];
    for (const c of clients || []) {
      if (c.status === 'churned') churned.push(c);
      else if (!c.onboarding_call_completed || new Date(c.created_at).getTime() > cutoff) onboarding.push(c);
    }
    onboarding.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    churned.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    return { onboarding, churned };
  }, [clients]);

  if (loading) return <Skeleton rows={8} className="h-14 w-full" />;

  return (
    <>
      <TabIntro id="pipeline" title="What is this?">
        The flow in and out. <b>New & Onboarding</b> is every client whose onboarding isn't finished yet, or who was added in the last 14 days — Typeform signups land here automatically. <b>Churned</b> is the recently cancelled, newest first. Use this tab to make sure new folks get activated and to see who rolled off lately.
      </TabIntro>
      <SectionHeader
        title="Pipeline"
        subtitle="New onboardings from Typeform and recently churned clients."
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Column
          title="New & Onboarding"
          count={onboarding.length}
          mrr={sumMRR(onboarding)}
          accent="emerald"
          empty="Nobody new. New signups land here automatically from Typeform.">
          {onboarding.map(c => (
            <Card key={c.id} client={c} onOpen={() => setOpenId(c.id)} metaLabel={`Added ${fmtDate(c.created_at)}`}
              tag={c.onboarding_call_completed ? 'Call done' : 'Onboarding pending'} />
          ))}
        </Column>

        <Column
          title="Churned"
          count={churned.length}
          mrr={sumMRR(churned)}
          accent="slate"
          empty="No churn to show. That's the dream.">
          {churned.map(c => (
            <Card key={c.id} client={c} onOpen={() => setOpenId(c.id)}
              metaLabel={`Churned ${fmtDate(c.updated_at || c.created_at)}`}
              tag={c.reason ? 'Has reason' : 'No reason logged'} />
          ))}
        </Column>
      </div>

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function Column({ title, count, mrr, accent, empty, children }) {
  const dot = accent === 'emerald' ? 'bg-emerald-400' : 'bg-slate-500';
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
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function Card({ client, metaLabel, tag, onOpen }) {
  return (
    <div onClick={onOpen}
         className="card p-4 cursor-pointer hover:bg-ink-800 transition flex items-center gap-3">
      <StatusDot status={client.status} label={false} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{client.name}</div>
        <div className="text-xs text-slate-500 truncate">{metaLabel}</div>
      </div>
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{tag}</span>
    </div>
  );
}

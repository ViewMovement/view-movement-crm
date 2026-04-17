import { useMemo, useState } from 'react';
import { useData } from '../lib/data.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Empty, SectionHeader, Skeleton, StatusDot, statusMeta, TabIntro } from '../components/primitives.jsx';
import { fmtDate, fmtRelative, fmtMRR, sumMRR } from '../lib/format.js';
import { useRole } from '../lib/role.jsx';

// Service cycle stages — the recirculating pipeline
const CYCLE_STAGES = [
  { key: 'onboarding',   label: 'Onboarding',    icon: '🌱', accent: 'emerald', empty: 'No one onboarding right now.' },
  { key: 'needs_loom',   label: 'Needs Loom',     icon: '🎥', accent: 'violet',  empty: 'All Looms are current.' },
  { key: 'needs_call',   label: 'Needs Call',      icon: '📞', accent: 'sky',     empty: 'All calls are current.' },
  { key: 'review_due',   label: 'Review Due',      icon: '📋', accent: 'amber',   empty: 'No reviews due soon.' },
  { key: 'all_current',  label: 'All Current',     icon: '✓',  accent: 'green',   empty: 'Nobody here yet — that means everyone needs something!' },
  { key: 'flagged',      label: 'Flagged',         icon: '⚑',  accent: 'rose',    empty: 'No open flags. Nice.' },
  { key: 'churned',      label: 'Churned',         icon: '—',  accent: 'slate',   empty: 'No churn. The dream.' }
];

const ACCENT_STYLES = {
  emerald: { dot: 'bg-emerald-400', border: 'border-emerald-500/20', headerBg: 'bg-emerald-500/5', text: 'text-emerald-400' },
  violet:  { dot: 'bg-violet-400',  border: 'border-violet-500/20',  headerBg: 'bg-violet-500/5',  text: 'text-violet-400' },
  sky:     { dot: 'bg-sky-400',     border: 'border-sky-500/20',     headerBg: 'bg-sky-500/5',     text: 'text-sky-400' },
  amber:   { dot: 'bg-amber-400',   border: 'border-amber-500/20',   headerBg: 'bg-amber-500/5',   text: 'text-amber-400' },
  green:   { dot: 'bg-emerald-400', border: 'border-emerald-500/20', headerBg: 'bg-emerald-500/5', text: 'text-emerald-400' },
  rose:    { dot: 'bg-rose-400',    border: 'border-rose-500/20',    headerBg: 'bg-rose-500/5',    text: 'text-rose-400' },
  slate:   { dot: 'bg-slate-500',   border: 'border-ink-700',        headerBg: 'bg-ink-900/40',    text: 'text-slate-500' }
};

export default function Pipeline() {
  const { clients, loading } = useData();
  const [openId, setOpenId] = useState(null);
  const { canSeeFinancials } = useRole();

  const columns = useMemo(() => {
    const buckets = {};
    for (const s of CYCLE_STAGES) buckets[s.key] = [];

    for (const c of clients || []) {
      const stage = c.cycle_stage || 'all_current';
      if (buckets[stage]) {
        buckets[stage].push(c);
      } else {
        buckets.all_current.push(c);
      }
    }

    // Sort within each column
    buckets.onboarding.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    buckets.needs_loom.sort((a, b) => urgencySort(a, b, 'loom'));
    buckets.needs_call.sort((a, b) => urgencySort(a, b, 'call_offer'));
    buckets.review_due.sort((a, b) => a.name.localeCompare(b.name));
    buckets.all_current.sort((a, b) => a.name.localeCompare(b.name));
    buckets.flagged.sort((a, b) => {
      // red > yellow > green
      const statusPri = { red: 0, yellow: 1, green: 2 };
      return (statusPri[a.status] ?? 3) - (statusPri[b.status] ?? 3) || a.name.localeCompare(b.name);
    });
    buckets.churned.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

    return buckets;
  }, [clients]);

  if (loading) return <Skeleton rows={8} className="h-14 w-full" />;

  const activeCount = (clients || []).filter(c => c.status !== 'churned').length;
  const cyclingCount = (columns.needs_loom.length + columns.needs_call.length + columns.review_due.length);

  return (
    <>
      <TabIntro id="pipeline" title="What is this?">
        The recirculating service cycle. Every active client flows through these stages: after onboarding, they cycle between <b>Needs Loom</b>, <b>Needs Call</b>, and <b>Review Due</b> based on timer states. When all touchpoints are current, they sit in <b>All Current</b> until their next action comes due. <b>Flagged</b> clients need attention. Actions auto-move cards forward.
      </TabIntro>
      <SectionHeader
        title="Pipeline"
        subtitle={`${activeCount} active · ${cyclingCount} need action · ${columns.churned.length} churned`}
      />

      {/* Cycle flow indicator */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
        {CYCLE_STAGES.map((stage, i) => {
          const count = columns[stage.key].length;
          const style = ACCENT_STYLES[stage.accent] || ACCENT_STYLES.slate;
          return (
            <div key={stage.key} className="flex items-center shrink-0">
              {i > 0 && i < CYCLE_STAGES.length - 1 && (
                <span className="text-slate-700 mx-1">→</span>
              )}
              {i === CYCLE_STAGES.length - 1 && (
                <span className="text-slate-700 mx-1">|</span>
              )}
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border ${
                count > 0
                  ? `${style.border} ${style.headerBg} ${style.text}`
                  : 'border-ink-700 bg-ink-900 text-slate-500'
              }`}>
                <span>{stage.icon}</span>
                <span className="font-medium">{stage.label}</span>
                <span className="tabular-nums">{count}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {CYCLE_STAGES.map(stage => (
          <CycleColumn
            key={stage.key}
            stage={stage}
            clients={columns[stage.key]}
            onOpen={setOpenId}
            canSeeFinancials={canSeeFinancials}
          />
        ))}
      </div>

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function urgencySort(a, b, timerType) {
  const ta = a.timers?.[timerType];
  const tb = b.timers?.[timerType];
  // Overdue first, then by due date ascending
  const aOverdue = ta?.is_overdue ? 1 : 0;
  const bOverdue = tb?.is_overdue ? 1 : 0;
  if (aOverdue !== bOverdue) return bOverdue - aOverdue;
  const aDate = ta?.next_due_at ? new Date(ta.next_due_at) : new Date('2999-01-01');
  const bDate = tb?.next_due_at ? new Date(tb.next_due_at) : new Date('2999-01-01');
  return aDate - bDate;
}

function CycleColumn({ stage, clients, onOpen, canSeeFinancials }) {
  const style = ACCENT_STYLES[stage.accent] || ACCENT_STYLES.slate;
  const count = clients.length;
  const mrr = canSeeFinancials ? sumMRR(clients) : null;

  return (
    <section className={`rounded-xl border ${style.border} overflow-hidden`}>
      <div className={`${style.headerBg} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
          <h3 className="text-sm font-medium tracking-tight">{stage.label}</h3>
        </div>
        <div className="flex items-center gap-2">
          {mrr ? <span className="text-[10px] font-medium tabular-nums text-slate-400">{fmtMRR(mrr, { compact: true })}/mo</span> : null}
          <span className={`text-xs tabular-nums font-medium ${style.text}`}>{count}</span>
        </div>
      </div>
      {count === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-slate-600">{stage.empty}</div>
      ) : (
        <div className="p-2 space-y-1.5 max-h-[55vh] overflow-y-auto">
          {clients.map(c => (
            <CycleCard key={c.id} client={c} stage={stage.key} onOpen={() => onOpen(c.id)} canSeeFinancials={canSeeFinancials} />
          ))}
        </div>
      )}
    </section>
  );
}

function CycleCard({ client, stage, onOpen, canSeeFinancials }) {
  const sm = statusMeta(client.status);
  const loom = client.timers?.loom;
  const call = client.timers?.call_offer;

  // Context line based on which stage the client is in
  let context = '';
  if (stage === 'onboarding') {
    const steps = client.onboarding_steps || {};
    const done = Object.keys(steps).length;
    context = `${done}/7 steps`;
  } else if (stage === 'needs_loom') {
    context = loom?.is_overdue
      ? `Overdue ${fmtRelative(loom.next_due_at)}`
      : loom ? `Due ${fmtRelative(loom.next_due_at)}` : 'Loom due';
  } else if (stage === 'needs_call') {
    context = call?.is_overdue
      ? `Overdue ${fmtRelative(call.next_due_at)}`
      : call ? `Due ${fmtRelative(call.next_due_at)}` : 'Call due';
  } else if (stage === 'review_due') {
    context = `${client.reviews_due || 1} review${(client.reviews_due || 1) > 1 ? 's' : ''} due`;
  } else if (stage === 'flagged') {
    context = `${client.open_flags || 1} open flag${(client.open_flags || 1) > 1 ? 's' : ''}`;
  } else if (stage === 'all_current') {
    // Show when next action is due
    const nextLoom = loom?.next_due_at ? new Date(loom.next_due_at) : null;
    const nextCall = call?.next_due_at ? new Date(call.next_due_at) : null;
    const next = nextLoom && nextCall ? (nextLoom < nextCall ? nextLoom : nextCall) : (nextLoom || nextCall);
    context = next ? `Next action ${fmtRelative(next.toISOString())}` : 'On track';
  } else if (stage === 'churned') {
    context = `Churned ${fmtDate(client.updated_at || client.created_at)}`;
  }

  const isOverdue = (stage === 'needs_loom' && loom?.is_overdue) || (stage === 'needs_call' && call?.is_overdue);

  return (
    <div onClick={onOpen}
      className={`rounded-lg px-3 py-2.5 cursor-pointer transition flex items-center gap-2.5 ${
        isOverdue
          ? 'bg-rose-500/5 border border-rose-500/20 hover:bg-rose-500/10'
          : 'bg-ink-900/60 border border-ink-800 hover:bg-ink-800'
      }`}>
      <StatusDot status={client.status} label={false} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{client.name}</div>
        <div className={`text-[11px] truncate ${isOverdue ? 'text-rose-300/80' : 'text-slate-500'}`}>
          {context}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {canSeeFinancials && client.mrr ? (
          <span className="text-[10px] tabular-nums text-slate-500">{fmtMRR(client.mrr, { compact: true })}</span>
        ) : null}
        <span className={`text-[10px] tracking-wide ${sm.cls || 'text-slate-600'}`}>{sm.label}</span>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useData } from '../lib/data.jsx';
import { useToast } from '../lib/toast.jsx';
import { api } from '../lib/api.js';
import ActionRow from '../components/ActionRow.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { Empty, SectionHeader, Skeleton } from '../components/primitives.jsx';

export default function Today() {
  const { today, loading, refresh } = useData();
  const { show } = useToast();
  const [selected, setSelected] = useState(new Set());
  const [openId, setOpenId] = useState(null);

  const buckets = useMemo(() => {
    const now = { overdue: [], today: [], soon: [] };
    for (const it of today || []) {
      if (it.is_overdue && it.days_overdue >= 1) now.overdue.push(it);
      else if (it.is_overdue) now.today.push(it);
      else now.soon.push(it);
    }
    return now;
  }, [today]);

  function toggleSel(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulk(type, label) {
    const ids = [...selected];
    if (!ids.length) return;
    await api.bulkAction(ids, type);
    setSelected(new Set());
    refresh(true);
    show({ message: `${label} for ${ids.length} client${ids.length === 1 ? '' : 's'}.` });
  }

  if (loading) return <div className="space-y-3"><Skeleton rows={6} className="h-14 w-full" /></div>;

  const total = today?.length || 0;

  return (
    <>
      <SectionHeader
        title="Today"
        subtitle={total ? `${total} item${total === 1 ? '' : 's'} need attention.` : 'You are clear for today.'}
        right={selected.size > 0 && (
          <div className="flex items-center gap-2 animate-fade">
            <span className="text-sm text-slate-400 tabular-nums">{selected.size} selected</span>
            <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
            <button className="btn btn-primary btn-sm" onClick={() => bulk('loom_sent', 'Loom Sent')}>Mark Loom Sent</button>
            <button className="btn btn-sm" onClick={() => bulk('call_offered', 'Call Offered')}>Mark Call Offered</button>
          </div>
        )}
      />

      {total === 0 ? (
        <Empty icon="✓" title="All caught up." hint="No overdue or due-today items. Come back tomorrow." />
      ) : (
        <div className="space-y-8">
          <Bucket title="Do Now"    items={buckets.overdue} kind="now"   selected={selected} onToggle={toggleSel} onOpen={setOpenId} />
          <Bucket title="Today"     items={buckets.today}   kind="today" selected={selected} onToggle={toggleSel} onOpen={setOpenId} />
          <Bucket title="Heads Up"  items={buckets.soon}    kind="soon"  selected={selected} onToggle={toggleSel} onOpen={setOpenId} />
        </div>
      )}

      {openId && <ClientDetailDrawer clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function Bucket({ title, items, kind, selected, onToggle, onOpen }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-medium text-slate-200 tracking-tight">{title}</h3>
        <span className="text-xs text-slate-500 tabular-nums">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <ActionRow
            key={`${it.client_id}-${it.timer_type}-${i}`}
            item={it}
            bucket={kind}
            selected={selected.has(it.client_id)}
            onToggleSelect={() => onToggle(it.client_id)}
            onOpen={() => onOpen(it.client_id)}
          />
        ))}
      </div>
    </section>
  );
}

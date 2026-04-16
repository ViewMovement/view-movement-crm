import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import { fmtMRR } from '../lib/format.js';

// Fuzzy matcher: normalize to alphanumeric lower then check containment both ways
function matchChannelToClient(channelName, clients) {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cn = norm(channelName);
  if (!cn) return null;
  for (const c of clients) {
    const nn = norm(c.name);
    if (nn && (cn.includes(nn) || nn.includes(cn))) return c;
  }
  return null;
}

const URGENCY_META = {
  urgent:   { label: 'Urgent',   color: 'border-rose-500/40 bg-rose-500/5',   chip: 'bg-rose-500/20 text-rose-300',    dot: 'bg-rose-400' },
  heads_up: { label: 'Heads up', color: 'border-amber-500/40 bg-amber-500/5', chip: 'bg-amber-500/20 text-amber-300',  dot: 'bg-amber-400' },
  fyi:      { label: 'FYI',      color: 'border-ink-700 bg-ink-900/40',       chip: 'bg-slate-500/20 text-slate-300',  dot: 'bg-slate-400' }
};

export default function SlackPulse() {
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [digest, setDigest] = useState(null);
  const [inactive, setInactive] = useState([]);
  const [filter, setFilter] = useState('unseen');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [allClients, setAllClients] = useState([]);
  const [openClientId, setOpenClientId] = useState(null);
  const { show } = useToast();

  async function runScan() {
    setScanning(true);
    try {
      const r = await api.slackRunNow();
      show?.({ message: `Scan complete · ${r.result?.inserted ?? 0} items · ${r.result?.scanned ?? 0} channels` });
      await load();
    } catch (e) {
      show?.({ message: 'Scan failed: ' + e.message, tone: 'error' });
    } finally { setScanning(false); }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, d, i] = await Promise.all([
        api.slackStatus(),
        api.slackPulse(filter),
        api.slackDigest(),
        api.slackInactive()
      ]);
      setStatus(s); setItems(p); setDigest(d); setInactive(i);
      // Also load client list for channel→client matching
      try { const cs = await api.listClients(); setAllClients(cs); } catch {}
    } catch (e) { show?.({ message: 'Failed to load Slack Pulse: ' + e.message }); }
    finally { setLoading(false); }
  }, [filter, show]);

  useEffect(() => { load(); }, [load]);

  async function seen(id) {
    setItems(prev => prev.filter(x => x.id !== id));
    try { await api.slackMarkSeen(id); show?.({ message: 'Dismissed' }); } catch (e) { show?.({ message: e.message }); load(); }
  }

  async function seenAll() {
    if (!items.length) return;
    setItems([]);
    try { await api.slackSeenAll(); show?.({ message: 'All dismissed' }); } catch { load(); }
  }

  if (!status) return <div className="text-slate-400">Loading…</div>;

  if (!status.slack_configured) {
    return <NotConfigured status={status} />;
  }

  // Build channel→client lookup for linking
  const channelClientMap = useMemo(() => {
    const map = {};
    const channels = new Set(items.map(i => i.channel_name).filter(Boolean));
    for (const ch of channels) {
      const match = matchChannelToClient(ch, allClients);
      if (match) map[ch] = match;
    }
    return map;
  }, [items, allClients]);

  const grouped = groupByChannel(items);
  const counts = {
    urgent:   items.filter(i => i.urgency === 'urgent').length,
    heads_up: items.filter(i => i.urgency === 'heads_up').length,
    fyi:      items.filter(i => i.urgency === 'fyi').length
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Slack Pulse · External</div>
          <h1 className="text-3xl font-semibold tracking-tight">Today's Slack read-out</h1>
          <div className="text-sm text-slate-400 mt-1">
            {digest ? `Last scan ${new Date(digest.generated_at).toLocaleString()} · ${digest.channels_scanned} channels · ${digest.items_found} items` : 'Waiting for first scan.'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runScan} disabled={scanning}
            className="px-3 py-1.5 rounded-md text-sm border border-ink-700 bg-ink-900 hover:bg-ink-800 text-slate-200 transition disabled:opacity-50">
            {scanning ? 'Scanning…' : 'Run scan'}
          </button>
          <FilterChip active={filter === 'unseen'} onClick={() => setFilter('unseen')}>Unseen</FilterChip>
          <FilterChip active={filter === 'all'}    onClick={() => setFilter('all')}>All</FilterChip>
          {items.length > 0 && filter === 'unseen' && (
            <button onClick={seenAll}
              className="px-3 py-1.5 rounded-md text-sm border border-ink-700 bg-ink-900 hover:bg-ink-800 text-slate-200 transition">
              Dismiss all
            </button>
          )}
        </div>
      </header>

      <AskBox />

      {digest?.summary_markdown && (
        <section className="p-5 rounded-xl border border-ink-800 bg-ink-900/40">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">AI briefing</div>
          <Markdown text={digest.summary_markdown} />
        </section>
      )}

      <section className="grid grid-cols-3 gap-3">
        <Count label="Urgent"   value={counts.urgent}   tone="bad"  />
        <Count label="Heads up" value={counts.heads_up} tone="warn" />
        <Count label="FYI"      value={counts.fyi} />
      </section>

      {inactive.length > 0 && (
        <section className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-baseline justify-between mb-2">
            <div className="font-medium text-amber-200">{inactive.length} channels quiet for 4+ days</div>
            <div className="text-xs text-amber-300/60">Worth checking in</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {inactive.map(c => (
              <span key={c.id} className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                #{c.name}
                <span className="text-amber-400/50 ml-1.5">
                  {c.last_activity_at ? relativeDays(c.last_activity_at) + 'd' : 'never'}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {loading ? <div className="text-slate-500">Loading items…</div> :
       items.length === 0 ? <EmptyState filter={filter} /> : (
        <section className="space-y-6">
          {Object.entries(grouped).map(([channel, msgs]) => {
            const linkedClient = channelClientMap[channel];
            return (
            <div key={channel}>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">#{channel}</div>
                {linkedClient && (
                  <button onClick={() => setOpenClientId(linkedClient.id)}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-ink-700 bg-ink-900 hover:bg-ink-800 text-emerald-300 transition">
                    {linkedClient.name} · {fmtMRR(linkedClient.mrr, { compact: true })} →
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {msgs.map(m => <PulseCard key={m.id} item={m} onSeen={() => seen(m.id)} />)}
              </div>
            </div>
          ); })}
        </section>
      )}

      {openClientId && <ClientDetailDrawer clientId={openClientId} onClose={() => setOpenClientId(null)} />}
    </div>
  );
}

function AskBox() {
  const [q, setQ] = useState('');
  const [deep, setDeep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function submit(e) {
    e?.preventDefault?.();
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await api.slackAsk(trimmed, deep);
      setResult(r);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <section className="p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-emerald-300/80">Ask the channels</div>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={deep} onChange={e => setDeep(e.target.checked)}
            className="accent-emerald-500" />
          Deep search (last 200 msgs)
        </label>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder='e.g. "Where are we at with Gary Taubes?"'
          className="flex-1 px-3 py-2 rounded-md bg-ink-950 border border-ink-700 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
        />
        <button type="submit" disabled={loading || !q.trim()}
          className="px-4 py-2 rounded-md text-sm bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition">
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      {error && <div className="mt-3 text-sm text-rose-400">Error: {error}</div>}
      {result && (
        <div className="mt-4 p-4 rounded-lg bg-ink-950/60 border border-ink-800">
          <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
            <span>Channel:</span>
            {result.channel
              ? <span className="text-emerald-300">#{result.channel.name}</span>
              : <span className="text-slate-500">(none matched)</span>}
            {result.channel && <span className="text-slate-600">· {result.message_count} msgs {result.deep ? '(deep)' : '(recent)'}</span>}
          </div>
          <Markdown text={result.answer} />
        </div>
      )}
    </section>
  );
}

function PulseCard({ item, onSeen }) {
  const meta = URGENCY_META[item.urgency] || URGENCY_META.fyi;
  return (
    <div className={`rounded-lg border ${meta.color} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`mt-1.5 w-2 h-2 rounded-full ${meta.dot} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.chip}`}>{meta.label}</span>
            <span className="text-xs text-slate-400">{item.sender_name || 'unknown'}</span>
            {item.category && <span className="text-xs text-slate-500">· {item.category.replace(/_/g, ' ')}</span>}
          </div>
          <div className="text-sm text-slate-100 leading-snug">{item.summary}</div>
          {item.suggested_action && (
            <div className="mt-2 text-xs text-slate-400">
              <span className="text-slate-500">Next step: </span>{item.suggested_action}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3 text-xs">
            {item.permalink && (
              <a href={item.permalink} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300">Open in Slack ↗</a>
            )}
            <button onClick={onSeen} className="text-slate-400 hover:text-slate-200">Seen</button>
            {item.seen_at && <span className="text-slate-600">· dismissed {new Date(item.seen_at).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm border transition ${
        active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-ink-700 bg-ink-900 text-slate-300 hover:bg-ink-800'
      }`}>{children}</button>
  );
}

function Count({ label, value, tone }) {
  const cls = tone === 'bad' ? 'text-rose-400' : tone === 'warn' ? 'text-amber-400' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${cls} mt-1`}>{value}</div>
    </div>
  );
}

function EmptyState({ filter }) {
  return (
    <div className="text-center py-16 border border-dashed border-ink-700 rounded-xl">
      <div className="text-5xl mb-3 opacity-40">✓</div>
      <div className="font-medium text-slate-200">{filter === 'unseen' ? 'Inbox zero' : 'No items yet'}</div>
      <div className="text-sm text-slate-500 mt-1">
        {filter === 'unseen' ? "Everything's been seen." : 'The next scan will bring fresh items in.'}
      </div>
    </div>
  );
}

function NotConfigured({ status }) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Slack Pulse</div>
        <h1 className="text-3xl font-semibold tracking-tight">Not connected yet</h1>
        <p className="text-sm text-slate-400 mt-2">
          To activate the daily 5am Slack scan with AI prioritization, add a bot token in Railway env vars.
          The bot will scan every accessible channel, classify messages by urgency, and flag channels quiet for 4+ days.
        </p>
      </div>
      <div className="p-5 rounded-xl border border-ink-800 bg-ink-900/40 space-y-4">
        <Step n={1} title="Create a Slack app">
          Go to <a className="text-emerald-400" href="https://api.slack.com/apps" target="_blank" rel="noreferrer">api.slack.com/apps</a> → Create New App → From scratch. Pick your workspace.
        </Step>
        <Step n={2} title="Add bot scopes">
          Under OAuth &amp; Permissions → Scopes → Bot Token Scopes, add: <code className="text-xs bg-ink-800 rounded px-1.5 py-0.5">channels:read</code>, <code className="text-xs bg-ink-800 rounded px-1.5 py-0.5">channels:history</code>, <code className="text-xs bg-ink-800 rounded px-1.5 py-0.5">channels:join</code>, <code className="text-xs bg-ink-800 rounded px-1.5 py-0.5">groups:read</code>, <code className="text-xs bg-ink-800 rounded px-1.5 py-0.5">groups:history</code>, <code className="text-xs bg-ink-800 rounded px-1.5 py-0.5">users:read</code>.
        </Step>
        <Step n={3} title="Install to workspace">
          Click "Install to Workspace" at the top of OAuth &amp; Permissions. Copy the Bot User OAuth Token (starts with <code className="text-xs bg-ink-800 rounded px-1.5 py-0.5">xoxb-</code>).
        </Step>
        <Step n={4} title="Add env vars in Railway">
          Set <code className="text-xs bg-ink-800 rounded px-1.5 py-0.5">SLACK_BOT_TOKEN=xoxb-...</code> and <code className="text-xs bg-ink-800 rounded px-1.5 py-0.5">ANTHROPIC_API_KEY=sk-ant-...</code>. Redeploy. The 5am job will pick them up automatically.
        </Step>
        <Step n={5} title="Invite the bot to private channels">
          For private channels you want scanned, <code className="text-xs bg-ink-800 rounded px-1.5 py-0.5">/invite @yourbot</code>. Public channels auto-join.
        </Step>
      </div>
      <div className="p-4 rounded-lg bg-ink-950 border border-ink-800 text-xs text-slate-500 font-mono">
        slack_configured: {String(status.slack_configured)} · anthropic_configured: {String(status.anthropic_configured)} · digest_hour: {status.digest_hour}:00 · inactive_threshold: {status.inactive_threshold_days}d
      </div>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold grid place-items-center">{n}</div>
      <div>
        <div className="font-medium text-slate-200 text-sm">{title}</div>
        <div className="text-sm text-slate-400 mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function Markdown({ text }) {
  // Minimal markdown: **bold**, lists, line breaks
  const lines = text.split('\n');
  return (
    <div className="text-sm text-slate-300 leading-relaxed space-y-1.5">
      {lines.map((l, i) => {
        if (!l.trim()) return <div key={i} className="h-1" />;
        const html = l
          .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-100">$1</strong>')
          .replace(/`([^`]+)`/g, '<code class="bg-ink-800 rounded px-1 py-0.5 text-xs">$1</code>');
        if (/^-\s/.test(l)) return <div key={i} className="pl-4 relative"><span className="absolute left-0 text-slate-500">·</span><span dangerouslySetInnerHTML={{ __html: html.replace(/^-\s/, '') }} /></div>;
        return <p key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}

function groupByChannel(items) {
  const out = {};
  // Sort: urgent first, then heads_up, then fyi
  const order = { urgent: 0, heads_up: 1, fyi: 2 };
  const sorted = [...items].sort((a, b) => (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3));
  for (const it of sorted) {
    const name = it.channel?.name || 'unknown';
    (out[name] = out[name] || []).push(it);
  }
  return out;
}

function relativeDays(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

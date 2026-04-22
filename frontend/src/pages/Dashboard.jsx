import { useState, useEffect } from 'react';

const CHECKLIST = [
  { id: 'discord', label: 'Check Discord notifications', description: 'Review all Discord channels for client messages and team updates' },
  { id: 'slack_notifs', label: 'Check Slack notifications & DMs', description: 'Clear your Slack inbox \u2014 reply to DMs, respond to mentions' },
  { id: 'slack_sweep', label: 'Slack client channel sweep', description: 'Scan each client channel for unanswered questions or updates' },
  { id: 'master_sheet', label: 'Check master sheet for quotas', description: 'Ensure all clients are on track for their reel quotas \u2014 communicate with the team if not' },
  { id: 'monitoring', label: 'Ongoing monitoring', description: 'Keep Slack and Discord open \u2014 respond to incoming client messages and team requests as they come in, troubleshoot issues' },
];

export default function Dashboard() {
  const [checked, setChecked] = useState(() => {
    try {
      const today = new Date().toDateString();
      const saved = localStorage.getItem('vm_checklist_date');
      if (saved === today) {
        return JSON.parse(localStorage.getItem('vm_checklist') || '{}');
      }
    } catch { /* ignore */ }
    return {};
  });

  useEffect(() => {
    localStorage.setItem('vm_checklist_date', new Date().toDateString());
    localStorage.setItem('vm_checklist', JSON.stringify(checked));
  }, [checked]);

  const toggle = (id) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  const doneCount = CHECKLIST.filter(c => checked[c.id]).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Daily Checklist</h2>
        <p className="text-sm text-slate-400 mt-1">
          {doneCount === CHECKLIST.length
            ? 'All done for today! Keep monitoring.'
            : `${doneCount}/${CHECKLIST.length} completed`}
        </p>
      </div>

      <div className="space-y-2">
        {CHECKLIST.map(item => (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            className={`w-full text-left card p-4 flex items-start gap-4 transition-all ${
              checked[item.id] ? 'opacity-60' : ''
            }`}
          >
            <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
              checked[item.id]
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-slate-500'
            }`}>
              {checked[item.id] && <span className="text-xs font-bold">\u2713</span>}
            </div>
            <div>
              <div className={`font-medium ${checked[item.id] ? 'line-through text-slate-500' : ''}`}>
                {item.label}
              </div>
              <div className="text-sm text-slate-400 mt-0.5">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import TodaysActions from '../components/TodaysActions.jsx';

export default function Dashboard() {
  const [today, setToday] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const t = await api.todayActions();
    setToday(t); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div className="space-y-8">
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
    </div>
  );
}

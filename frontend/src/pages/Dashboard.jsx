import { useState, useEffect } from 'react';

const CHECKLIST = [
  { id: 'discord', label: 'Check Discord notifications', description: 'Review all Discord channels for client messages and team updates' },
  { id: 'slack_notifs', label: 'Check Slack notifications & DMs', description: 'Clear your Slack inbox — reply to DMs, respond to mentions' },
  { id: 'slack_sweep', label: 'Slack client channel sweep', description: 'Scan each client channel for unanswered questions or updates' },
  { id: 'master_sheet', label: 'Check master sheet for quotas', description: 'Ensure all clients are on track for their reel quotas — communicate with the team if not' },
  { id: 'monitoring', label: 'Ongoing monitoring', description: 'Keep Slack and Discord open — respond to incoming client messages and team requests as they come in, troubleshoot issues' },
];

export default function Dashboard() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const [checked, setChecked] = useState(() => {
    try {
      const saved = localStorage.getItem('vm_checklist');
      const parsed = JSON.parse(saved);
      if (parsed && parsed._date === todayKey) return parsed;
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

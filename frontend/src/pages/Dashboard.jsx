import { useState, useEffect } from 'react';

const CHECKLIST = [
  'Check Discord notifications',
  'Check Slack notifications & DMs',
  'Slack client channel sweep',
  'Check master sheet for quotas',
  'Ongoing monitoring',
];

function getTodayKey() {
  return 'vm-daily-' + new Date().toISOString().slice(0, 10);
}

function loadChecked() {
  try {
    const raw = localStorage.getItem(getTodayKey());
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export default function Dashboard() {
  const [checked, setChecked] = useState(loadChecked);

  useEffect(() => {
    localStorage.setItem(getTodayKey(), JSON.stringify(checked));
  }, [checked]);

  function toggle(i) {
    setChecked(prev => ({ ...prev, [i]: !prev[i] }));
  }

  const doneCount = Object.values(checked).filter(Boolean).length;
  const allDone = doneCount === CHECKLIST.length;

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-bold text-white mb-1">Daily Checklist</h2>
      <p className="text-sm text-slate-400 mb-6">
        {allDone ? 'All done for today!' : doneCount + '/' + CHECKLIST.length + ' completed'}
      </p>
      <div className="space-y-2">
        {CHECKLIST.map((item, i) => {
          const done = !!checked[i];
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={
                'w-full text-left px-4 py-3 rounded-lg border transition-all ' +
                (done
                  ? 'bg-ink-900/50 border-ink-700/50 opacity-60'
                  : 'bg-ink-900 border-ink-700 hover:border-ink-700/80')
              }
            >
              <span className={'text-sm ' + (done ? 'line-through text-slate-500' : 'text-slate-200')}>
                {done ? '\u2713 ' : ''}{item}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

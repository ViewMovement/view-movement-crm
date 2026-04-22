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

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function DataProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [today, setToday] = useState([]);
  const [triage, setTriage] = useState(null);
  const [flags, setFlags] = useState([]);
  const [savePlans, setSavePlans] = useState([]);
  const [sync, setSync] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [c, t, tr, fl, sp, s] = await Promise.all([
        api.listClients(),
        api.todayActions(),
        api.triage().catch(() => null),
        api.listFlags().catch(() => ({ flags: [] })),
        api.listSavePlans().catch(() => []),
        api.syncStatus().catch(() => null)
      ]);
      setClients(c); setToday(t); setTriage(tr);
      setFlags(fl?.flags || []); setSavePlans(sp); setSync(s);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(() => refresh(true), 90_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <Ctx.Provider value={{ clients, today, triage, flags, savePlans, sync, loading, lastRefresh, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useData() { return useContext(Ctx); }

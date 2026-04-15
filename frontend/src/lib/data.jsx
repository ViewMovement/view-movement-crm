import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function DataProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [today, setToday] = useState([]);
  const [sync, setSync] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [c, t, s] = await Promise.all([
        api.listClients(),
        api.todayActions(),
        api.syncStatus().catch(() => null)
      ]);
      setClients(c); setToday(t); setSync(s);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh silently every 90s
  useEffect(() => {
    const id = setInterval(() => refresh(true), 90_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <Ctx.Provider value={{ clients, today, sync, loading, lastRefresh, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useData() { return useContext(Ctx); }

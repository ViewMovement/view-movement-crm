import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

const RoleCtx = createContext({ role: null, loading: true, canSeeFinancials: false, isAdmin: false });

export function RoleProvider({ children }) {
  const { user } = useAuth();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setRole(null); setLoading(false); return; }
    api.myRole()
      .then(r => setRole(r.role || 'ops'))
      .catch(() => setRole('ops'))
      .finally(() => setLoading(false));
  }, [user?.email]);

  const value = {
    role,
    loading,
    isAdmin: role === 'admin',
    isRetention: role === 'retention' || role === 'admin',
    isOps: role === 'ops',
    canSeeFinancials: role === 'admin' || role === 'retention'
  };

  return <RoleCtx.Provider value={value}>{children}</RoleCtx.Provider>;
}

export function useRole() { return useContext(RoleCtx); }

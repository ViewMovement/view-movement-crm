import { createContext, useContext, useState, useCallback } from 'react';

const Ctx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(ts => ts.filter(t => t.id !== id));
  }, []);

  const show = useCallback((opts) => {
    const id = Math.random().toString(36).slice(2);
    const toast = { id, duration: 5000, ...opts };
    setToasts(ts => [...ts, toast]);
    if (toast.duration) {
      setTimeout(() => dismiss(id), toast.duration);
    }
    return id;
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ show, dismiss }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
               className="pointer-events-auto flex items-center gap-3 rounded-xl border border-ink-600 bg-ink-800/95 backdrop-blur-md shadow-2xl px-4 py-3 min-w-[320px] max-w-[520px] animate-slide-up">
            <div className={`h-2 w-2 rounded-full ${t.tone === 'error' ? 'bg-status-red' : 'bg-emerald-400'}`} />
            <div className="flex-1 text-sm text-slate-100">{t.message}</div>
            {t.action && (
              <button
                className="text-sm font-medium text-emerald-300 hover:text-emerald-200 transition"
                onClick={() => { t.action.onClick(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() { return useContext(Ctx); }

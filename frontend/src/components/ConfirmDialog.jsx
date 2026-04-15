import { useEffect, useState } from 'react';

export default function ConfirmDialog({
  title,
  subtitle,
  checks = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onClose
}) {
  const [checked, setChecked] = useState(() => checks.map(() => false));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const allChecked = checks.length === 0 || checked.every(Boolean);

  async function handleConfirm() {
    if (!allChecked || busy) return;
    setBusy(true);
    try {
      await onConfirm?.();
      onClose?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm" onClick={() => !busy && onClose?.()}>
      <div
        className="w-full max-w-md rounded-xl border border-ink-700 bg-ink-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-3">
          <div className="text-lg font-semibold text-slate-50 tracking-tight">{title}</div>
          {subtitle && <div className="text-sm text-slate-400 mt-1">{subtitle}</div>}
        </div>

        {checks.length > 0 && (
          <div className="px-6 py-3 space-y-2 border-t border-ink-800">
            {checks.map((label, i) => (
              <label key={i} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checked[i]}
                  onChange={e => setChecked(c => c.map((v, idx) => idx === i ? e.target.checked : v))}
                  className="mt-0.5 h-4 w-4 rounded border-ink-600 bg-ink-800 text-emerald-500 focus:ring-emerald-500/50"
                />
                <span className={`text-sm ${checked[i] ? 'text-slate-300' : 'text-slate-400 group-hover:text-slate-200'}`}>{label}</span>
              </label>
            ))}
          </div>
        )}

        <div className="px-6 py-4 border-t border-ink-800 flex items-center justify-end gap-2">
          <button
            onClick={() => !busy && onClose?.()}
            disabled={busy}
            className="px-4 py-2 rounded-md text-sm text-slate-300 hover:bg-ink-800 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allChecked || busy}
            className={`px-4 py-2 rounded-md text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
              danger
                ? 'bg-rose-500 hover:bg-rose-400 text-white'
                : 'bg-emerald-500 hover:bg-emerald-400 text-ink-950'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS = [
  { group: 'Navigate', items: [
    ['H', 'Today'],
    ['T', 'Triage board'],
    ['C', 'Clients'],
    ['P', 'Pipeline'],
    ['B', 'Billing'],
    ['A', 'Activity'],
    ['S', 'Save Queue'],
    ['F', 'Flags'],
    ['R', 'Reports'],
    ['G', 'Digest'],
    [',', 'Settings']
  ]},
  { group: 'Actions', items: [
    ['⌘K', 'Command palette'],
    ['/',  'Search'],
    ['?',  'Show this overlay'],
    ['Esc','Close dialogs']
  ]}
];

export default function ShortcutOverlay({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-ink-700 bg-ink-900 shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-lg font-semibold tracking-tight text-slate-100">Keyboard shortcuts</h3>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">Esc</button>
        </div>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
          {SHORTCUTS.map(({ group, items }) => (
            <div key={group}>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">{group}</div>
              <div className="space-y-1">
                {items.map(([k, v]) => (
                  <div key={k} className="flex justify-between items-baseline text-sm py-1">
                    <span className="text-slate-300">{v}</span>
                    <kbd className="text-[10px] bg-ink-950 border border-ink-700 rounded px-1.5 py-0.5">{k}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

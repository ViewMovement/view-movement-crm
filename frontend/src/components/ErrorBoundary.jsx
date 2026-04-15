import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[ErrorBoundary]', err, info); }
  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen grid place-items-center p-8 bg-ink-950 text-slate-200">
          <div className="max-w-md text-center">
            <div className="text-5xl mb-4">⚠</div>
            <h1 className="text-xl font-semibold tracking-tight mb-2">Something went sideways</h1>
            <p className="text-sm text-slate-400 mb-6">The app hit an unexpected error. Try reloading — your data is safe.</p>
            <pre className="text-[11px] text-left text-slate-500 bg-ink-900 border border-ink-800 rounded p-3 mb-6 overflow-auto max-h-40">{String(this.state.err?.stack || this.state.err)}</pre>
            <button onClick={() => location.reload()} className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-ink-950 text-sm font-medium">Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

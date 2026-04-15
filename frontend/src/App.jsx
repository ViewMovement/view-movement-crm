import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import SyncIndicator from './components/SyncIndicator.jsx';

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    function onKey(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPaletteOpen(p => !p); return;
      }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); setPaletteOpen(true); return; }
      if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey) nav('/');
      if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) nav('/clients');
      if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey) nav('/pipeline');
      if (e.key.toLowerCase() === 'b' && !e.metaKey && !e.ctrlKey) nav('/billing');
      if (e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey) nav('/activity');
      if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey) nav('/save-queue');
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) nav('/flags');
      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey) nav('/digest');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  return (
    <div className="min-h-screen flex">
      <Sidebar onOpenPalette={() => setPaletteOpen(true)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-ink-800 bg-ink-950/60 backdrop-blur sticky top-0 z-20">
          <div className="h-14 px-6 flex items-center justify-between gap-4">
            <div className="md:hidden font-semibold text-sm">View Movement</div>
            <div className="ml-auto flex items-center gap-4">
              <SyncIndicator />
            </div>
          </div>
        </header>
        <main className="flex-1 px-6 py-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

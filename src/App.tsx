'use client';

import { useEffect, useState } from 'react';

import { CallView } from './features/call/call-view';
import { SettingsView } from './features/settings/settings-view';
import { useSettingsStore } from './features/settings/store';

export function App() {
  const loaded = useSettingsStore((s) => s.loaded);
  const load = useSettingsStore((s) => s.load);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) return null;

  return showSettings ? (
    <SettingsView onClose={() => setShowSettings(false)} />
  ) : (
    <CallView onOpenSettings={() => setShowSettings(true)} />
  );
}

import { useState } from 'react';

import { CallScreen } from './screens/CallScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { loadSettings, saveSettings } from './lib/settings';

export function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return (
      <SettingsScreen
        settings={settings}
        onSave={(next) => {
          saveSettings(next);
          setSettings(next);
        }}
        onClose={() => setShowSettings(false)}
      />
    );
  }

  return <CallScreen settings={settings} onOpenSettings={() => setShowSettings(true)} />;
}

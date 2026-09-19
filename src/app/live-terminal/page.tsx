'use client';

import { LiveTerminalView } from '../../features/live-terminal/live-terminal-view';
import { useEnsureSettingsLoaded } from '../../features/settings/hooks/use-ensure-settings-loaded';

export default function LiveTerminalPage() {
  const loaded = useEnsureSettingsLoaded();
  if (!loaded) return null;
  return <LiveTerminalView />;
}

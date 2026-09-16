'use client';

import { useEnsureSettingsLoaded } from '../../features/settings/hooks/use-ensure-settings-loaded';
import { SettingsView } from '../../features/settings/settings-view';

export default function SettingsPage() {
  const loaded = useEnsureSettingsLoaded();
  if (!loaded) return null;
  return <SettingsView />;
}

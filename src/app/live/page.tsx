'use client';

import { CallView } from '../../features/call/call-view';
import { useEnsureSettingsLoaded } from '../../features/settings/hooks/use-ensure-settings-loaded';

export default function LivePage() {
  const loaded = useEnsureSettingsLoaded();
  if (!loaded) return null;
  return <CallView />;
}

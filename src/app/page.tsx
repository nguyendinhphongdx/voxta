'use client';

import { ConversationView } from '../features/conversation/conversation-view';
import { useEnsureSettingsLoaded } from '../features/settings/hooks/use-ensure-settings-loaded';

export default function Page() {
  const loaded = useEnsureSettingsLoaded();
  if (!loaded) return null;
  return <ConversationView />;
}

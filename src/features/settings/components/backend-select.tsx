import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import type { VoxtaSettings } from '../../../lib/settings';
import { SettingsField } from './settings-field';

export const BACKEND_LABEL: Record<VoxtaSettings['backend'], string> = {
  ultron: 'Ultron',
  hermes: 'Hermes Agent',
  'claude-code': 'Claude Code',
  'tmux-agent': 'Terminal Agent (tmux)',
  'remote-terminal': 'Terminal Remote (relay)',
};

interface BackendSelectProps {
  value: VoxtaSettings['backend'];
  onChange: (backend: VoxtaSettings['backend']) => void;
}

export function BackendSelect({ value, onChange }: BackendSelectProps) {
  return (
    <SettingsField label="Backend">
      <Select value={value} onValueChange={(v) => onChange(v as VoxtaSettings['backend'])}>
        <SelectTrigger className="w-full">
          <SelectValue>{(v: VoxtaSettings['backend']) => BACKEND_LABEL[v]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(BACKEND_LABEL) as VoxtaSettings['backend'][]).map((backend) => (
            <SelectItem key={backend} value={backend}>
              {BACKEND_LABEL[backend]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsField>
  );
}

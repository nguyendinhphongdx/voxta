import { Input } from '../../../../components/ui/input';
import { SettingsField } from '../settings-field';
import type { BackendFieldsProps } from './types';

export function RemoteTerminalFields({ value, onChange }: BackendFieldsProps) {
  return (
    <>
      <p className="rounded-md border border-muted-foreground/30 bg-muted p-3 text-sm text-muted-foreground">
        Điều khiển 1 terminal trên máy khác qua relay của <code>vscode-remote</code> (agent chạy sẵn trên máy đích
        qua lệnh <code>opencode start</code>) — dùng khi máy đó KHÔNG SSH thẳng được (sau NAT...). Nếu SSH thẳng
        được, dùng Terminal Agent (tmux) với lệnh <code>ssh user@host</code> đơn giản hơn nhiều.
      </p>
      <SettingsField label="Relay URL">
        <Input
          value={value.remoteTerminalRelayUrl}
          onChange={(e) => onChange({ remoteTerminalRelayUrl: e.target.value })}
          placeholder="https://your-relay.example.com"
        />
      </SettingsField>
      <SettingsField label="Machine ID">
        <Input
          value={value.remoteTerminalMachineId}
          onChange={(e) => onChange({ remoteTerminalMachineId: e.target.value })}
          placeholder="153554948"
        />
      </SettingsField>
      <SettingsField label="Password">
        <Input
          value={value.remoteTerminalPassword}
          onChange={(e) => onChange({ remoteTerminalPassword: e.target.value })}
          placeholder="Mật khẩu agent (opencode password)"
          type="password"
        />
      </SettingsField>
    </>
  );
}

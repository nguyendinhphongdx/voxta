import { Input } from '../../../../components/ui/input';
import { SettingsField } from '../settings-field';
import type { BackendFieldsProps } from './types';

export function TmuxAgentFields({ value, onChange }: BackendFieldsProps) {
  return (
    <>
      <p className="rounded-md border border-muted-foreground/30 bg-muted p-3 text-sm text-muted-foreground">
        Điều khiển 1 CLI agent tương tác thật (Codex, Claude Code...) bằng cách gõ phím + đọc màn hình qua tmux —
        dùng được với bất kỳ CLI nào chạy trong terminal, nhưng không đọc trả lời theo thời gian thực từng chữ
        được (phải đợi agent nói xong 1 lượt mới đọc).
      </p>

      <SettingsField label="Lệnh khởi động">
        <Input
          value={value.tmuxAgentCommand}
          onChange={(e) => onChange({ tmuxAgentCommand: e.target.value })}
          placeholder="codex"
        />
      </SettingsField>

      <SettingsField label="Project Directory">
        <Input
          value={value.tmuxAgentProjectDir}
          onChange={(e) => onChange({ tmuxAgentProjectDir: e.target.value })}
          placeholder="/Users/ban/Code/du-an"
        />
      </SettingsField>
    </>
  );
}

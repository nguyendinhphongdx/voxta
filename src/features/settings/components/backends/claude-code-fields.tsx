import { Input } from '../../../../components/ui/input';
import { SettingsField } from '../settings-field';
import type { BackendFieldsProps } from './types';

export function ClaudeCodeFields({ value, onChange }: BackendFieldsProps) {
  return (
    <>
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        Claude Code sẽ chạy với quyền bỏ qua mọi xác nhận (<code>--dangerously-skip-permissions</code>) — có thể
        sửa file, chạy lệnh thật trong thư mục dưới đây chỉ dựa trên giọng nói bạn nhận diện được. Chỉ trỏ vào
        project bạn chấp nhận rủi ro đó.
      </p>

      <SettingsField label="Project Directory">
        <Input
          value={value.claudeCodeProjectDir}
          onChange={(e) => onChange({ claudeCodeProjectDir: e.target.value })}
          placeholder="/Users/ban/Code/du-an"
        />
      </SettingsField>

      <SettingsField label="Đường dẫn claude CLI (để trống = tự dò)">
        <Input
          value={value.claudeCodeBinaryPath}
          onChange={(e) => onChange({ claudeCodeBinaryPath: e.target.value })}
          placeholder="claude"
        />
      </SettingsField>
    </>
  );
}

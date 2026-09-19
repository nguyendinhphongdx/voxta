'use client';

import { useEffect, useState } from 'react';

import { Input } from '../../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { SettingsField } from '../settings-field';
import type { BackendFieldsProps } from './types';

interface ClaudeCodeSession {
  sessionId: string;
  preview: string;
  updatedAt: number;
}

const NEW_SESSION_VALUE = '__new__';

function formatUpdatedAt(ms: number): string {
  return new Date(ms).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

/** Danh sách session Claude Code đã có cho `projectDir` hiện tại — đọc trực tiếp từ
 * `~/.claude/projects/<projectDir>/*.jsonl` qua `/api/claude-code/sessions` (transcript Claude
 * Code tự lưu, không phải thứ voxta tạo ra). Tải lại mỗi khi đổi Project Directory vì session gắn
 * theo đúng thư mục đó. */
function useClaudeCodeSessions(projectDir: string): { sessions: ClaudeCodeSession[]; loading: boolean } {
  const [sessions, setSessions] = useState<ClaudeCodeSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectDir.trim()) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch('/api/claude-code/sessions')
      .then((res) => res.json())
      .then((body: { sessions?: ClaudeCodeSession[] }) => {
        if (!cancelled) setSessions(body.sessions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectDir]);

  return { sessions, loading };
}

export function ClaudeCodeFields({ value, onChange }: BackendFieldsProps) {
  const { sessions, loading } = useClaudeCodeSessions(value.claudeCodeProjectDir);

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

      <SettingsField label="Tiếp tục session">
        <Select
          value={value.claudeCodeSessionId || NEW_SESSION_VALUE}
          onValueChange={(v) => onChange({ claudeCodeSessionId: v === NEW_SESSION_VALUE ? '' : (v ?? '') })}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(v: string) => {
                if (v === NEW_SESSION_VALUE) return 'Bắt đầu mới';
                const session = sessions.find((s) => s.sessionId === v);
                return session ? session.preview : v;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEW_SESSION_VALUE}>Bắt đầu mới</SelectItem>
            {sessions.map((session) => (
              <SelectItem key={session.sessionId} value={session.sessionId}>
                {formatUpdatedAt(session.updatedAt)} — {session.preview}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          {loading
            ? 'Đang tải danh sách session...'
            : !value.claudeCodeProjectDir.trim()
              ? 'Nhập Project Directory để xem session đã có.'
              : sessions.length === 0
                ? 'Chưa có session nào cho thư mục này.'
                : `Chỉ áp dụng cho lượt đầu tiên của cuộc gọi/chat kế tiếp — resume qua đúng lịch sử "${sessions.find((s) => s.sessionId === value.claudeCodeSessionId)?.preview ?? ''}".`}
        </p>
      </SettingsField>
    </>
  );
}

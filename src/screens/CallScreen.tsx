import { useMemo } from 'react';

import { UltronConnector } from '../connectors/ultron/UltronConnector';
import { useVoiceCall } from '../lib/useVoiceCall';
import type { VoxtaSettings } from '../lib/settings';

const STATE_LABEL: Record<string, string> = {
  listening: 'Đang nghe...',
  thinking: 'Đang nghĩ...',
  speaking: 'Đang nói...',
  using_tool: 'Đang xử lý...',
};

interface CallScreenProps {
  settings: VoxtaSettings;
  onOpenSettings: () => void;
}

/** Màn hình chính — CHỈ 1 nút tròn + trạng thái, không có transcript/chat log mặc định. */
export function CallScreen({ settings, onOpenSettings }: CallScreenProps) {
  const createConnector = useMemo(
    () => () =>
      new UltronConnector({ apiBaseUrl: settings.apiBaseUrl, agentId: settings.agentId }),
    [settings.apiBaseUrl, settings.agentId],
  );
  const { status, voiceState, error, start, stop } = useVoiceCall(createConnector);

  const isActive = status === 'active';
  const label =
    status === 'connecting'
      ? 'Đang kết nối...'
      : status === 'error'
        ? (error ?? 'Có lỗi xảy ra')
        : isActive
          ? STATE_LABEL[voiceState]
          : 'Chạm để bắt đầu';

  const ringClass =
    status === 'error'
      ? 'ring-error'
      : voiceState === 'listening' && isActive
        ? 'ring-listening'
        : voiceState === 'thinking' && isActive
          ? 'ring-thinking'
          : voiceState === 'speaking' && isActive
            ? 'ring-speaking'
            : 'ring-idle';

  return (
    <div className="call-screen">
      <button type="button" className="settings-button" onClick={onOpenSettings} aria-label="Cài đặt">
        ⚙
      </button>
      <button
        type="button"
        className={`call-button ${ringClass}`}
        onClick={isActive || status === 'connecting' ? stop : start}
      >
        {isActive || status === 'connecting' ? '■' : '●'}
      </button>
      <p className="call-label">{label}</p>
    </div>
  );
}

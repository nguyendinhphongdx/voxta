import type { VoiceState } from '../../connectors/types';
import type { CallStatus } from './store';

/** Trạng thái hiển thị hợp nhất từ `CallStatus` (idle/connecting/active/error) +
 * `VoiceState` (listening/thinking/speaking/using_tool) — dùng chung cho CallOrb, VoiceWave và
 * label trong CallView để cả 3 luôn đồng bộ với nhau. */
export type Visual = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'using_tool' | 'error';

export function resolveVisual(status: CallStatus, voiceState: VoiceState): Visual {
  if (status === 'error') return 'error';
  if (status === 'connecting') return 'connecting';
  if (status === 'active') return voiceState;
  return 'idle';
}

export const STATE_LABEL: Record<Visual, string> = {
  idle: 'Chạm để bắt đầu',
  connecting: 'Đang kết nối...',
  listening: 'Đang nghe...',
  thinking: 'Đang nghĩ...',
  speaking: 'Đang nói...',
  using_tool: 'Đang xử lý...',
  error: 'Có lỗi xảy ra',
};

/** Tên biến CSS token màu tương ứng mỗi trạng thái (định nghĩa ở globals.css) — dùng cho
 * gradient/glow tự tính bằng inline style ở CallOrb/CallView, không biểu diễn gọn bằng Tailwind
 * utility thuần vì cần `color-mix()` động theo token thay đổi runtime. */
export const VOICE_COLOR_VAR: Record<Visual, string> = {
  idle: '--voice-idle',
  connecting: '--voice-idle',
  listening: '--voice-listening',
  thinking: '--voice-thinking',
  speaking: '--voice-speaking',
  using_tool: '--voice-thinking',
  error: '--voice-error',
};

/** Trạng thái nào đang "sống" (có nhịp thở/ripple) — idle/error đứng yên. */
export const ACTIVE_VISUALS = new Set<Visual>(['listening', 'thinking', 'speaking', 'using_tool']);

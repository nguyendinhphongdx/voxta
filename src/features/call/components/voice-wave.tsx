import { cn } from '../../../lib/utils';
import type { Visual } from '../visual';

const VISUAL_TEXT_COLOR: Record<Visual, string> = {
  idle: 'text-voice-idle',
  connecting: 'text-voice-idle',
  listening: 'text-voice-listening',
  thinking: 'text-voice-thinking',
  speaking: 'text-voice-speaking',
  using_tool: 'text-voice-thinking',
  error: 'text-voice-error',
};

/** Dải 5 thanh nhỏ dưới CallOrb — animation đổi theo trạng thái (nghe/nghĩ/nói), không phải
 * amplitude audio thật. Animation-delay so le theo :nth-child và các @keyframes theo
 * `data-visual` được định nghĩa trong `globals.css` (khó biểu diễn gọn bằng utility Tailwind
 * thuần vì cần so le theo từng thanh con). */
export function VoiceWave({ visual }: { visual: Visual }) {
  return (
    <div
      className={cn('voice-wave flex h-7 items-center justify-center gap-1.5', VISUAL_TEXT_COLOR[visual])}
      data-visual={visual}
      aria-hidden="true"
    >
      <span className="bar" />
      <span className="bar" />
      <span className="bar" />
      <span className="bar" />
      <span className="bar" />
    </div>
  );
}

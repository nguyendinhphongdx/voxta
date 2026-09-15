import { cva } from 'class-variance-authority';
import { Mic, Square } from 'lucide-react';

import { cn } from '../../../lib/utils';
import { ACTIVE_VISUALS, VOICE_COLOR_VAR } from '../visual';
import type { Visual } from '../visual';

const buttonVariants = cva(
  'relative z-10 flex size-36 items-center justify-center rounded-full text-white transition-transform duration-300 ease-out active:scale-95',
  {
    variants: {
      visual: {
        idle: '',
        connecting: '',
        listening: 'animate-breathe',
        thinking: 'animate-breathe',
        speaking: 'animate-breathe',
        using_tool: 'animate-breathe',
        error: '',
      } satisfies Record<Visual, string>,
    },
  },
);

interface CallOrbProps {
  visual: Visual;
  /** true khi đang active HOẶC đang connecting — quyết định icon (mic vs stop) và nhãn a11y. */
  active: boolean;
  onClick: () => void;
}

/** Nút tròn lớn — trung tâm của CallView. Bề mặt gradient (highlight ở góc trên-trái, giống mặt
 * cầu thuỷ tinh) + glow toả ra ngoài bằng box-shadow mờ, cả hai đổi màu theo token trạng thái.
 * Vòng ripple (`animate-ping` có sẵn của Tailwind) chỉ hiện khi đang "sống"
 * (nghe/nghĩ/nói) — idle/error đứng yên, không gây phân tâm. */
export function CallOrb({ visual, active, onClick }: CallOrbProps) {
  const colorVar = VOICE_COLOR_VAR[visual];
  const isAlive = ACTIVE_VISUALS.has(visual);

  return (
    <div className="relative flex items-center justify-center">
      {isAlive && (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-ping rounded-full opacity-25"
          style={{ backgroundColor: `var(${colorVar})` }}
        />
      )}
      <button
        type="button"
        className={cn(buttonVariants({ visual }))}
        style={{
          background: `radial-gradient(circle at 32% 26%, color-mix(in oklch, var(${colorVar}) 45%, white 40%), var(${colorVar}) 68%)`,
          boxShadow: `0 0 50px -6px var(${colorVar})`,
        }}
        onClick={onClick}
        aria-label={active ? 'Dừng cuộc gọi' : 'Bắt đầu cuộc gọi'}
      >
        {active ? <Square className="size-10 fill-current" /> : <Mic className="size-10" />}
      </button>
    </div>
  );
}

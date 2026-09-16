'use client';

import { ArrowLeft, Settings } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '../../components/ui/button';
import { useSettingsStore } from '../settings/store';
import { CallOrb } from './components/call-orb';
import { VoiceWave } from './components/voice-wave';
import { useCallLifecycle } from './hooks/use-call-lifecycle';
import { useCallStore } from './store';
import { STATE_LABEL, VOICE_COLOR_VAR, resolveVisual } from './visual';

/** Màn hình chính — 1 nút tròn + label trạng thái + waveform nhỏ, không có transcript/chat log
 * mặc định. Nền có 1 quầng sáng mờ (glow) đổi màu theo trạng thái, đặt phía sau orb. */
export function CallView() {
  useCallLifecycle();

  const settings = useSettingsStore((s) => s.settings);
  const status = useCallStore((s) => s.status);
  const voiceState = useCallStore((s) => s.voiceState);
  const error = useCallStore((s) => s.error);
  const start = useCallStore((s) => s.start);
  const stop = useCallStore((s) => s.stop);

  const isActive = status === 'active';
  const isBusy = isActive || status === 'connecting';
  const visual = resolveVisual(status, voiceState);
  const label = visual === 'error' ? (error ?? STATE_LABEL.error) : STATE_LABEL[visual];
  const colorVar = VOICE_COLOR_VAR[visual];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-3xl transition-colors duration-700"
        style={{ backgroundColor: `var(${colorVar})` }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link
          href="/"
          className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'rounded-full' })}
          aria-label="Về Conversation"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Link
          href="/settings"
          className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'rounded-full' })}
          aria-label="Cài đặt"
        >
          <Settings className="size-5" />
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-16">
        <CallOrb visual={visual} active={isBusy} onClick={isBusy ? stop : () => void start(settings)} />
        <VoiceWave visual={visual} />
        <span
          className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-300"
          style={{
            borderColor: `color-mix(in oklch, var(${colorVar}) 40%, transparent)`,
            backgroundColor: `color-mix(in oklch, var(${colorVar}) 14%, transparent)`,
            color: `color-mix(in oklch, var(${colorVar}) 70%, white 30%)`,
          }}
        >
          {label}
        </span>
      </main>
    </div>
  );
}

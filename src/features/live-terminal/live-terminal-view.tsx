'use client';

import { ArrowLeft, Settings } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '../../components/ui/button';
import { unlockAudioPlayback } from '../../lib/unlock-audio-playback';
import { useSettingsStore } from '../settings/store';
import { CallOrb } from '../call/components/call-orb';
import { VoiceWave } from '../call/components/voice-wave';
import { useCallLifecycle } from '../call/hooks/use-call-lifecycle';
import { useCallStore } from '../call/store';
import { STATE_LABEL, VOICE_COLOR_VAR, resolveVisual } from '../call/visual';
import { TerminalPanel } from './components/terminal-panel';

/** Bản Live riêng cho backend `remote-terminal` — cùng state machine/orb/voice-wave với
 * `CallView` (tái dùng nguyên `features/call/*`, không fork logic), chỉ khác layout: thêm cột
 * terminal bên cạnh để THẤY output đang được đọc, không chỉ nghe. Xem plan doc cho lý do tách
 * route riêng thay vì nhánh điều kiện trong CallView. */
export function LiveTerminalView() {
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
    <div className="relative flex h-screen flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-3xl transition-colors duration-700"
        style={{ backgroundColor: `var(${colorVar})` }}
      />

      <header className="relative z-10 flex shrink-0 items-center justify-between px-6 py-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
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

      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-6 pb-[max(2rem,env(safe-area-inset-bottom))] lg:flex-row lg:items-stretch lg:gap-8">
        <div className="flex shrink-0 flex-col items-center justify-center gap-6 lg:flex-1">
          <CallOrb
            visual={visual}
            active={isBusy}
            onClick={
              isBusy
                ? stop
                : () => {
                    unlockAudioPlayback();
                    void start(settings);
                  }
            }
          />
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
        </div>

        <div className="min-h-[40vh] flex-1 pb-4 lg:min-h-0 lg:flex-[1.3] lg:pb-0">
          <TerminalPanel />
        </div>
      </main>
    </div>
  );
}

'use client';

import { Mic, SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button, buttonVariants } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useSettingsStore } from '../settings/store';
import { sendTextMessage, supportsTextChat } from './agent-session';
import { MessageItem } from './components/message-item';
import { useConversationStore } from './store';

/** Màn hình chính mới — chat kiểu Gemini: message vào/ra dạng list, Live (giọng nói) chỉ là 1 chế
 * độ giao tiếp mở qua nút mic (route `/live`), không còn là màn hình duy nhất như trước. */
export function ConversationView() {
  const settings = useSettingsStore((s) => s.settings);
  const messages = useConversationStore((s) => s.messages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const canChat = supportsTextChat(settings);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    try {
      await sendTextMessage(settings, text);
    } finally {
      setSending(false);
    }
  };

  const isRemoteTerminal = settings.backend === 'remote-terminal';
  const liveHref = isRemoteTerminal ? '/live-terminal' : '/live';

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="text-sm font-medium tracking-wide text-foreground/60">voxta</span>
        <div className="flex items-center gap-2">
          <Link href="/settings" className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label="Cài đặt">
            <SettingsIcon className="size-4" />
          </Link>
          <Link href={liveHref} className={buttonVariants({ variant: 'default', size: 'icon' })} aria-label="Chế độ Live">
            <Mic className="size-4" />
          </Link>
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          canChat ? (
            <p className="mx-auto mt-10 max-w-sm text-center text-sm text-muted-foreground">
              Gõ tin nhắn bên dưới, hoặc bấm nút mic để chuyển sang chế độ Live (nói chuyện bằng giọng nói).
            </p>
          ) : isRemoteTerminal ? (
            <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                Backend này điều khiển terminal từ xa bằng giọng nói — mở Live Terminal để nói chuyện và xem output.
              </p>
              <Link href="/live-terminal" className={buttonVariants({ variant: 'default' })}>
                <Mic className="size-4" />
                Mở Live Terminal
              </Link>
            </div>
          ) : (
            <p className="mx-auto mt-10 max-w-sm text-center text-sm text-muted-foreground">
              Backend này chỉ giao tiếp bằng giọng nói — bấm nút mic để bắt đầu.
            </p>
          )
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((m) => (
              <MessageItem key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      {canChat && (
        <form
          className="mx-auto flex w-full max-w-2xl items-center gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nhắn tin..."
            disabled={sending}
          />
          <Button type="submit" disabled={sending || !draft.trim()} className="shrink-0">
            Gửi
          </Button>
        </form>
      )}
    </div>
  );
}

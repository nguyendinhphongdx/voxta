'use client';

import { ArrowLeft, MessageSquarePlus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button, buttonVariants } from '../../components/ui/button';
import { useConversationStore } from '../../features/conversation/store';

interface ConversationListItem {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Màn danh sách hội thoại đã lưu (Conversation mode gõ text) — bấm vào 1 item điều hướng tới
 * `/?c=<id>`, trang chính (`app/page.tsx`'s `ConversationLoader`) tự fetch/nạp từ đúng query đó
 * (KHÔNG nạp thẳng vào store rồi push `/` trơn ở đây nữa — làm vậy khiến `?c=` không bao giờ
 * khớp URL thật, mất khả năng F5/bookmark/back button đúng hội thoại). Chỉ hiển thị hội thoại có
 * ít nhất 1 tin nhắn (store không lưu hội thoại rỗng, xem `conversation-view.tsx`). */
export default function ConversationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ConversationListItem[] | null>(null);
  const clear = useConversationStore((s) => s.clear);

  useEffect(() => {
    void fetch('/api/conversations')
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const openConversation = (id: string) => {
    router.push(`/?c=${id}`);
  };

  const startNew = () => {
    clear();
    router.push('/');
  };

  const removeConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setItems((prev) => prev?.filter((c) => c.id !== id) ?? prev);
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label="Quay lại">
            <ArrowLeft className="size-4" />
          </Link>
          <span className="text-sm font-medium tracking-wide text-foreground/60">Lịch sử hội thoại</span>
        </div>
        <Button variant="ghost" size="icon" aria-label="Hội thoại mới" onClick={startNew}>
          <MessageSquarePlus className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {items === null ? (
          <p className="mx-auto mt-10 max-w-sm text-center text-sm text-muted-foreground">Đang tải...</p>
        ) : items.length === 0 ? (
          <p className="mx-auto mt-10 max-w-sm text-center text-sm text-muted-foreground">
            Chưa có hội thoại nào được lưu. Gõ chat ở màn chính để bắt đầu.
          </p>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => openConversation(item.id)}
                className="flex items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{formatTime(item.updated_at)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Xoá hội thoại"
                  onClick={(e) => void removeConversation(item.id, e)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

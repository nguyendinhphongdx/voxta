'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

import { ConversationView } from '../features/conversation/conversation-view';
import { useConversationStore } from '../features/conversation/store';
import { useEnsureSettingsLoaded } from '../features/settings/hooks/use-ensure-settings-loaded';

/** `?c=<id>` là NGUỒN SỰ THẬT duy nhất cho "đang xem hội thoại nào" — 2 chiều:
 * 1. Nạp từ URL (mở lại hội thoại đã lưu từ `/conversations`, hoặc F5 giữa chừng không mất —
 *    trước đây `/conversations`'s `openConversation` nạp thẳng vào store rồi điều hướng tới `/`
 *    KHÔNG kèm `?c=`, khiến cơ chế này không bao giờ được kích hoạt qua UI; giờ nó điều hướng tới
 *    `/?c=<id>` thay vì tự fetch/load).
 * 2. Đồng bộ NGƯỢC lại URL khi store có `currentId` MỚI mà URL chưa khớp (gõ tin nhắn đầu tiên
 *    của 1 hội thoại hoàn toàn mới, `addUserMessage` tự sinh `currentId` — xem
 *    `features/conversation/store.ts`) — để URL luôn khớp đúng hội thoại đang hiện, không chỉ lúc
 *    mở từ danh sách. */
function ConversationLoader() {
  const router = useRouter();
  const conversationIdFromUrl = useSearchParams().get('c');
  const currentId = useConversationStore((s) => s.currentId);
  const load = useConversationStore((s) => s.load);
  const clear = useConversationStore((s) => s.clear);
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationIdFromUrl || loadedIdRef.current === conversationIdFromUrl) return;
    loadedIdRef.current = conversationIdFromUrl;
    void fetch(`/api/conversations/${conversationIdFromUrl}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) load(data.id, data.messages);
        else clear();
      });
  }, [conversationIdFromUrl, load, clear]);

  useEffect(() => {
    if (!currentId || currentId === conversationIdFromUrl) return;
    // Đã có sẵn đúng nội dung trong store rồi (vừa gõ xong, không phải vừa nạp từ URL) — đánh dấu
    // để effect nạp ở trên không tự fetch lại khi thấy URL đổi do chính `router.replace` này gây
    // ra (tránh vòng lặp round-trip fetch thừa).
    loadedIdRef.current = currentId;
    router.replace(`/?c=${currentId}`);
  }, [currentId, conversationIdFromUrl, router]);

  return <ConversationView />;
}

export default function Page() {
  const loaded = useEnsureSettingsLoaded();
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <ConversationLoader />
    </Suspense>
  );
}

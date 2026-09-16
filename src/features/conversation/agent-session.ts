import { createConnector } from '../../connectors/create-connector';
import type { VoiceBackendConnector } from '../../connectors/types';
import type { AssistantStreamEvent } from '../../connectors/voice-text-bridge';
import type { VoxtaSettings } from '../../lib/settings';
import { useConversationStore } from './store';

/** Connector chỉ dùng cho chat gõ TEXT — tách hẳn khỏi connector của Live call
 * (`features/call/store.ts` tự giữ connector riêng cho mic/VAD/TTS). Vì vậy lịch sử phía backend
 * (`history` của HermesConnector, `sessionId` của ClaudeCodeConnector) của 2 chế độ KHÔNG dùng
 * chung — bắt đầu Live không "thấy" các tin nhắn đã gõ trước đó và ngược lại, dù cả 2 cùng hiện
 * lên 1 luồng Conversation UI. Coi là giới hạn tạm thời của giai đoạn này. */
let textConnector: VoiceBackendConnector | null = null;
let textConnectorBackend: VoxtaSettings['backend'] | null = null;

interface TextSendable {
  sendTextMessage(
    userText: string,
    onDelta: (delta: string) => void,
    onEvent?: (event: AssistantStreamEvent) => void,
  ): Promise<void>;
}

function isTextSendable(connector: VoiceBackendConnector): connector is VoiceBackendConnector & TextSendable {
  return typeof (connector as Partial<TextSendable>).sendTextMessage === 'function';
}

/** Ultron thuần voice (Gemini Live), không có API text nào để gõ chat — chỉ dùng được qua Live. */
export function supportsTextChat(settings: VoxtaSettings): boolean {
  return settings.backend !== 'ultron';
}

/** Gửi 1 tin nhắn gõ tay, ghi thẳng vào `useConversationStore` — không đụng tới mic/mic
 * permission/VAD, không đọc to trả lời (đây là chat, không phải Live). */
export async function sendTextMessage(settings: VoxtaSettings, text: string): Promise<void> {
  const store = useConversationStore.getState();
  store.addUserMessage(text);

  if (!textConnector || textConnectorBackend !== settings.backend) {
    textConnector = createConnector(settings);
    textConnectorBackend = settings.backend;
  }

  if (!isTextSendable(textConnector)) {
    throw new Error('Backend này chưa hỗ trợ chat bằng text — dùng chế độ Live (giọng nói).');
  }

  const assistantId = store.startAssistantMessage();
  try {
    await textConnector.sendTextMessage(
      text,
      (delta) => store.appendText(assistantId, delta),
      (event) => {
        switch (event.type) {
          case 'thinking-delta':
            store.appendThinking(assistantId, event.text);
            break;
          case 'tool-call-start':
            store.addToolCall(assistantId, event.id, event.name);
            break;
          case 'tool-call-input':
            store.setToolCallInput(assistantId, event.id, event.input);
            break;
          case 'tool-result':
            store.addToolResult(assistantId, event.id, event.output);
            break;
        }
      },
    );
    store.finishMessage(assistantId);
  } catch (err) {
    store.failMessage(assistantId, err instanceof Error ? err.message : 'Không gọi được backend.');
  }
}

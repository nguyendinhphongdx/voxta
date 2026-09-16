import { create } from 'zustand';

import { AudioPlayer } from '../../audio/AudioPlayer';
import { MicCapture } from '../../audio/MicCapture';
import { createConnector } from '../../connectors/create-connector';
import type { VoiceBackendConnector, VoiceEvent, VoiceState } from '../../connectors/types';
import type { VoxtaSettings } from '../../lib/settings';
import { useConversationStore } from '../conversation/store';

export type CallStatus = 'idle' | 'connecting' | 'active' | 'error';

interface CallStore {
  status: CallStatus;
  voiceState: VoiceState;
  error: string | null;
  start: (settings: VoxtaSettings) => Promise<void>;
  stop: () => void;
}

// Tài nguyên side-effect (WebSocket, AudioContext, mic stream...) giữ ở module scope thay vì
// trong state Zustand — chúng không phải dữ liệu cần re-render khi đổi, chỉ 3 field
// status/voiceState/error mới cần reactive. Nhét class instance vào state Zustand vẫn hợp lệ,
// nhưng để riêng thế này rõ ràng hơn: "state" là những gì UI hiển thị, "resource" là những gì
// cuộc gọi đang giữ.
let connector: VoiceBackendConnector | null = null;
let mic: MicCapture | null = null;
let player: AudioPlayer | null = null;
// Message assistant đang stream trong lượt Live hiện tại — forward vào cùng `useConversationStore`
// mà chat gõ text dùng, để transcript của Live cũng hiện lên Conversation view. `null` nghĩa là
// chưa có câu trả lời nào đang mở cho lượt nói hiện tại.
let liveAssistantMessageId: string | null = null;

/** Đóng connector/mic/player, không đụng tới status — status do caller quyết định (idle khi
 * user chủ động dừng, error khi cuộc gọi hỏng giữa chừng). */
function cleanupResources(): void {
  connector?.close();
  connector = null;
  mic?.stop();
  mic = null;
  player?.stop();
  player = null;
}

/** Store 1 cuộc gọi voice, connector-agnostic — không biết/không quan tâm backend thật là Ultron
 * hay Hermes, chỉ gọi qua `VoiceBackendConnector` (xem connectors/types.ts). Global theo thiết kế
 * (không phải per-component) vì voxta chỉ có 1 cuộc gọi tại 1 thời điểm. */
export const useCallStore = create<CallStore>((set, get) => ({
  status: 'idle',
  voiceState: 'listening',
  error: null,

  start: async (settings) => {
    if (get().status === 'connecting' || get().status === 'active') return;
    set({ error: null, status: 'connecting' });

    const nextConnector = createConnector(settings);
    connector = nextConnector;
    const nextPlayer = nextConnector.managesOwnAudio ? null : new AudioPlayer();
    player = nextPlayer;
    const nextMic = nextConnector.managesOwnAudio ? null : new MicCapture();
    mic = nextMic;

    const handleEvent = (event: VoiceEvent) => {
      switch (event.type) {
        case 'audio-delta':
          set({ voiceState: 'speaking' });
          nextPlayer?.playChunk(event.pcm);
          break;
        case 'transcript-delta': {
          const conversation = useConversationStore.getState();
          if (event.role === 'user') {
            conversation.addUserMessage(event.text);
            liveAssistantMessageId = null; // lượt mới — trả lời tiếp theo mở message assistant mới
          } else {
            if (!liveAssistantMessageId) liveAssistantMessageId = conversation.startAssistantMessage();
            conversation.appendText(liveAssistantMessageId, event.text);
          }
          break;
        }
        case 'state':
          set({ voiceState: event.value });
          // 'listening' là lúc bridge đã đọc xong trả lời và sẵn sàng nghe câu tiếp theo — coi đây
          // là tín hiệu "lượt trả lời đã xong" để đóng message lại (voice-text-bridge không có event
          // "assistant-done" riêng).
          if (event.value === 'listening' && liveAssistantMessageId) {
            useConversationStore.getState().finishMessage(liveAssistantMessageId);
            liveAssistantMessageId = null;
          }
          break;
        case 'interrupted':
          nextPlayer?.interrupt();
          set({ voiceState: 'listening' });
          break;
        case 'turn-complete':
          set({ voiceState: 'listening' });
          break;
        case 'error':
          if (liveAssistantMessageId) {
            useConversationStore.getState().failMessage(liveAssistantMessageId, event.message);
            liveAssistantMessageId = null;
          }
          cleanupResources();
          set({ error: event.message, status: 'error' });
          break;
      }
    };

    try {
      nextConnector.on(handleEvent);
      await nextConnector.connect();
      nextPlayer?.start(nextConnector.outputSampleRate);
      await nextMic?.start(nextConnector.inputSampleRate, (pcm) => nextConnector.sendAudioChunk(pcm));
      set({ status: 'active' });
    } catch (err) {
      cleanupResources();
      set({
        error: err instanceof Error ? err.message : 'Không bắt đầu được cuộc gọi.',
        status: 'error',
      });
    }
  },

  stop: () => {
    cleanupResources();
    set({ status: 'idle', voiceState: 'listening' });
  },
}));

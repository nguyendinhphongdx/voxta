import { create } from 'zustand';

import { AudioPlayer } from '../../audio/AudioPlayer';
import { MicCapture } from '../../audio/MicCapture';
import { createConnector } from '../../connectors/create-connector';
import type { VoiceBackendConnector, VoiceEvent, VoiceState } from '../../connectors/types';
import type { VoxtaSettings } from '../../lib/settings';
import { isTerminalCapable, type TerminalCapable } from '../conversation/agent-session';
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
let connectorBackend: VoxtaSettings['backend'] | null = null;
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
  connectorBackend = null;
  mic?.stop();
  mic = null;
  player?.stop();
  player = null;
}

function handleConnectorEvent(event: VoiceEvent): void {
  switch (event.type) {
    case 'audio-delta':
      useCallStore.setState({ voiceState: 'speaking' });
      player?.playChunk(event.pcm);
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
      useCallStore.setState({ voiceState: event.value });
      // 'listening' là lúc bridge đã đọc xong trả lời và sẵn sàng nghe câu tiếp theo — coi đây
      // là tín hiệu "lượt trả lời đã xong" để đóng message lại (voice-text-bridge không có event
      // "assistant-done" riêng).
      if (event.value === 'listening' && liveAssistantMessageId) {
        useConversationStore.getState().finishMessage(liveAssistantMessageId);
        liveAssistantMessageId = null;
      }
      break;
    case 'interrupted':
      player?.interrupt();
      useCallStore.setState({ voiceState: 'listening' });
      break;
    case 'turn-complete':
      useCallStore.setState({ voiceState: 'listening' });
      break;
    case 'error':
      if (liveAssistantMessageId) {
        useConversationStore.getState().failMessage(liveAssistantMessageId, event.message);
        liveAssistantMessageId = null;
      }
      cleanupResources();
      useCallStore.setState({ error: event.message, status: 'error' });
      break;
  }
}

/** Tạo (nếu chưa có, hoặc backend đã đổi) connector cho `settings.backend` — KHÔNG bật mic/STT/VAD
 * (đó là việc riêng của `start()` dưới đây, chỉ chạy khi user bấm nút voice). Cho phép panel
 * terminal tương tác (`/live-terminal`) tự kết nối PTY ngay khi mở trang, ĐỘC LẬP với việc có bấm
 * nút voice hay không — trước đây terminal chỉ "ready" sau khi bấm voice vì cả 2 dùng chung 1
 * bước khởi tạo connector nằm trong `start()`. Bấm nút voice SAU khi terminal đã kết nối sẽ tái sử
 * dụng ĐÚNG connector này (gắn thêm mic/STT lên trên), không tạo lại phiên WS/terminal từ đầu. */
export function ensureConnector(settings: VoxtaSettings): VoiceBackendConnector {
  if (connector && connectorBackend === settings.backend) return connector;
  cleanupResources(); // đổi backend giữa chừng (hiếm) hoặc chưa có gì — dọn cái cũ trước khi tạo mới
  const next = createConnector(settings);
  connector = next;
  connectorBackend = settings.backend;
  next.on(handleConnectorEvent);
  return next;
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

    const nextConnector = ensureConnector(settings);
    const nextPlayer = nextConnector.managesOwnAudio ? null : new AudioPlayer();
    player = nextPlayer;
    const nextMic = nextConnector.managesOwnAudio ? null : new MicCapture();
    mic = nextMic;

    try {
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

  // LƯU Ý: dừng voice hiện vẫn đóng LUÔN cả connector (kể cả phiên terminal, nếu panel
  // `/live-terminal` đã tự kết nối độc lập trước đó) — tách "dừng nghe" khỏi "đóng hẳn phiên
  // terminal" cần base class hỗ trợ tạm dừng STT/VAD riêng mà không đóng WS (chưa có), để dành
  // cho sau. V1: bấm dừng voice = đóng tất cả, giống hành vi trước khi có terminal độc lập.
  stop: () => {
    cleanupResources();
    set({ status: 'idle', voiceState: 'listening' });
  },
}));

/** "Tay cầm" điều khiển terminal của connector ĐANG SỐNG hiện tại (module-scope `connector` ở
 * trên, dù được tạo qua `ensureConnector()` độc lập hay qua `start()`) — dùng cho panel xterm.js
 * tương tác trực tiếp ở `/live-terminal`: `connectTerminal()` mở phiên PTY, `onRawOutput()` nhận
 * output live để `term.write()`, `writeRaw()` gửi thẳng từng phím gõ (`term.onData()`). KHÔNG còn
 * yêu cầu `status === 'active'` — terminal dùng được ngay cả khi chưa/không bao giờ bấm nút voice.
 * `null` khi chưa có connector nào, hoặc backend hiện tại không hỗ trợ (chỉ `RemoteTerminalConnector`
 * có). */
export function getLiveTerminal(): TerminalCapable | null {
  if (!connector || !isTerminalCapable(connector)) return null;
  return connector;
}

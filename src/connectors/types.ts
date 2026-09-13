/** Interface chung mọi backend agent phải implement — CallScreen chỉ biết interface này, không
 * biết Ultron/Hermes/backend khác làm gì bên trong (relay qua socket của chính nó, hay tự nói
 * chuyện thẳng với 1 provider speech-to-speech khác — xem plan Phase 1/Phase 2). */

export type VoiceState = 'listening' | 'thinking' | 'speaking' | 'using_tool';

export type VoiceEvent =
  | { type: 'audio-delta'; pcm: ArrayBuffer }
  | { type: 'transcript-delta'; role: 'user' | 'model'; text: string }
  | { type: 'state'; value: VoiceState }
  | { type: 'interrupted' }
  | { type: 'turn-complete' }
  | { type: 'error'; message: string };

export interface VoiceBackendConnector {
  /** Mở phiên thật (tạo conversation nếu cần, mở socket...) — ném lỗi nếu không kết nối được. */
  connect(): Promise<void>;
  /** Gửi 1 chunk audio mic (PCM16 little-endian, sample rate theo `inputSampleRate`). */
  sendAudioChunk(pcm: ArrayBuffer): void;
  /** Đăng ký nghe event — trả về hàm huỷ đăng ký. */
  on(handler: (event: VoiceEvent) => void): () => void;
  close(): void;
  readonly inputSampleRate: number;
  readonly outputSampleRate: number;
}

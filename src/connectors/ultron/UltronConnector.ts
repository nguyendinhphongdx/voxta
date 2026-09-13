import type { VoiceBackendConnector, VoiceEvent, VoiceState } from '../types';

const CAPTURE_SAMPLE_RATE = 16_000; // input Gemini Live yêu cầu (PCM 16-bit, 16kHz, LE) — quyết
// định của apps/api/app/modules/voice/gemini_live_client.py, KHÔNG phải của connector này.
const PLAYBACK_SAMPLE_RATE = 24_000; // output thật của Gemini Live.

/** Shape JSON server (Ultron `apps/api`) gửi qua WebSocket — khớp
 * `apps/web/src/features/voice/types/voice.types.ts::VoiceServerEvent`. Đổi ở BE Ultron thì sửa
 * ở đây. */
type UltronServerEvent =
  | { type: 'state'; value: VoiceState }
  | { type: 'transcript'; role: 'user' | 'model'; text: string }
  | { type: 'interrupted' }
  | { type: 'turn_complete' };

export interface UltronBackendConfig {
  /** Base URL của apps/api Ultron, vd http://localhost:8000 (không có trailing slash). */
  apiBaseUrl: string;
  /** agent_id gán cho conversation mới tạo — null = agent mặc định theo AppSettings của Ultron. */
  agentId: number | null;
}

/** Mô hình RELAY đầy đủ (khác Hermes) — connector chỉ nói chuyện với `apps/api` của Ultron, KHÔNG
 * bao giờ tự kết nối tới Gemini; backend Ultron đứng giữa toàn bộ luồng audio (ADR-0009). */
export class UltronConnector implements VoiceBackendConnector {
  readonly inputSampleRate = CAPTURE_SAMPLE_RATE;
  readonly outputSampleRate = PLAYBACK_SAMPLE_RATE;

  private ws: WebSocket | null = null;
  private handlers = new Set<(event: VoiceEvent) => void>();
  private readonly config: UltronBackendConfig;

  constructor(config: UltronBackendConfig) {
    this.config = config;
  }

  private emit(event: VoiceEvent): void {
    for (const handler of this.handlers) handler(event);
  }

  on(handler: (event: VoiceEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Tạo 1 Conversation mới mỗi lần connect — voxta không có UI quản lý hội thoại (Phase 1,
   * "voice-first" không cần lịch sử nhiều hội thoại như Ultron web console). */
  private async createConversation(): Promise<number> {
    const res = await fetch(`${this.config.apiBaseUrl}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'voxta', agent_id: this.config.agentId }),
    });
    if (!res.ok) throw new Error(`Không tạo được conversation (HTTP ${res.status})`);
    const data = (await res.json()) as { id: number };
    return data.id;
  }

  async connect(): Promise<void> {
    const conversationId = await this.createConversation();
    const wsBase = this.config.apiBaseUrl.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/conversations/${conversationId}/voice`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Không mở được voice WebSocket tới Ultron.'));
    });

    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        this.emit({ type: 'audio-delta', pcm: event.data });
        return;
      }
      const payload = JSON.parse(event.data as string) as UltronServerEvent;
      if (payload.type === 'state') {
        this.emit({ type: 'state', value: payload.value });
      } else if (payload.type === 'transcript') {
        this.emit({ type: 'transcript-delta', role: payload.role, text: payload.text });
      } else if (payload.type === 'interrupted') {
        this.emit({ type: 'interrupted' });
      } else if (payload.type === 'turn_complete') {
        this.emit({ type: 'turn-complete' });
      }
    };
    ws.onerror = () => this.emit({ type: 'error', message: 'Mất kết nối voice session.' });
    ws.onclose = () => this.emit({ type: 'error', message: 'Kết nối voice đã đóng.' });
  }

  sendAudioChunk(pcm: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm);
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
  }
}

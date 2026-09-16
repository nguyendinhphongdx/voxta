import { VoiceTextBridgeConnector } from '../voice-text-bridge';

export interface HermesBackendConfig {
  /** Base URL của Hermes Gateway API (OpenAI-compatible), vd http://localhost:8642. */
  gatewayUrl: string;
  /** `API_SERVER_KEY` cấu hình trên Hermes — gửi qua header `Authorization: Bearer`. */
  apiKey: string;
  /** Tên model Hermes route tới (theo cấu hình model của profile) — để trống dùng mặc định server. */
  model: string;
  /** Ngôn ngữ cho SpeechRecognition/SpeechSynthesis (BCP-47), vd "vi-VN". */
  language: string;
  /** 'browser' đọc bằng SpeechSynthesis miễn phí có sẵn (chất lượng thấp); 'openai'/'google' gọi
   * TTS thật qua proxy server `/api/tts` (key không lộ ra browser — xem route đó). */
  ttsProvider: 'browser' | 'openai' | 'google';
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Dặn model đừng dùng markdown vì trả lời sẽ được đọc thành giọng nói — sửa từ gốc thay vì
 * dọn markdown bằng code sau khi nhận (xem `voice-text-bridge.ts`'s `sanitizeForSpeech`, vẫn giữ
 * làm lưới an toàn cho lúc model không theo đúng chỉ dẫn). */
const VOICE_SYSTEM_NOTE =
  'Bạn đang trả lời bằng giọng nói qua cuộc gọi thoại — câu trả lời sẽ được đọc lên bằng TTS. ' +
  'Trả lời bằng câu văn nói tự nhiên, ngắn gọn. KHÔNG dùng markdown (không **đậm**, không ' +
  'heading #, không bullet -, không code block ```). Nếu cần nhắc tới code, mô tả bằng lời thay ' +
  'vì dán nguyên đoạn code.';

/** Connector cho Hermes Agent (Gateway API OpenAI-compatible, thuần HTTP text-in/text-out).
 * Không có voice model native nên toàn bộ STT/VAD/TTS do `VoiceTextBridgeConnector` lo — phần
 * riêng của Hermes chỉ là: giữ lịch sử hội thoại (Gateway API không tự nhớ, mỗi request phải gửi
 * lại nguyên `messages`) và gọi `POST /v1/chat/completions?stream=true`, parse SSE thành text
 * delta. */
export class HermesConnector extends VoiceTextBridgeConnector {
  private readonly hermesConfig: HermesBackendConfig;
  private history: ChatMessage[] = [{ role: 'system', content: VOICE_SYSTEM_NOTE }];

  constructor(config: HermesBackendConfig) {
    super({ language: config.language, ttsProvider: config.ttsProvider });
    this.hermesConfig = config;
  }

  protected async fetchAssistantReply(
    userText: string,
    onDelta: (delta: string) => void,
  ): Promise<void> {
    this.history.push({ role: 'user', content: userText });

    const res = await fetch(`${this.hermesConfig.gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.hermesConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: this.hermesConfig.model,
        messages: this.history,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Hermes gateway lỗi (HTTP ${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullReply = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // dòng cuối có thể bị cắt giữa chừng — giữ lại chờ chunk sau

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;

        let json: { choices?: Array<{ delta?: { content?: string } }> };
        try {
          json = JSON.parse(payload) as typeof json;
        } catch {
          continue; // dòng SSE lỗi/không đầy đủ — bỏ qua, không phải lỗi fatal
        }
        const delta = json.choices?.[0]?.delta?.content ?? '';
        if (!delta) continue;
        fullReply += delta;
        onDelta(delta);
      }
    }

    this.history.push({ role: 'assistant', content: fullReply });
  }
}

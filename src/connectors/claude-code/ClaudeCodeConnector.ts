import { VoiceTextBridgeConnector } from '../voice-text-bridge';

export interface ClaudeCodeBackendConfig {
  /** Ngôn ngữ cho SpeechRecognition/SpeechSynthesis (BCP-47), vd "vi-VN". */
  language: string;
  /** 'browser' đọc bằng SpeechSynthesis miễn phí có sẵn (chất lượng thấp); 'openai'/'google' gọi
   * TTS thật qua proxy server `/api/tts` (key không lộ ra browser — xem route đó). */
  ttsProvider: 'browser' | 'openai' | 'google';
}

/** 1 dòng NDJSON thật từ `claude -p ... --output-format stream-json --include-partial-messages`
 * — chỉ khai type những field connector dùng tới, bỏ qua phần còn lại (event schema có rất
 * nhiều loại: hook, rate-limit, tool-use...). */
interface ClaudeCodeLine {
  type?: string;
  subtype?: string;
  session_id?: string;
  is_error?: boolean;
  result?: string;
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
  };
}

/** Connector cho Claude Code CLI — chạy `claude -p` ở chế độ headless như 1 subprocess phía
 * server (xem `/api/claude-code/chat/route.ts`), KHÔNG phải 1 Gateway API có sẵn như Hermes.
 * Toàn bộ STT/VAD/TTS do `VoiceTextBridgeConnector` lo; phần riêng ở đây chỉ là gọi route nội bộ
 * và parse đúng NDJSON event schema thật của Claude Code (`content_block_delta` cho text streaming
 * theo token, `system/init` cho session_id lần đầu) để nối lại lịch sử qua `--resume` ở các lượt
 * sau trong CÙNG 1 cuộc gọi. `projectDir`/đường dẫn binary đọc từ Settings NGAY TRONG route phía
 * server (giống `/api/tts` đọc key phía server) — connector không cần biết/gửi các giá trị đó.
 *
 * CẢNH BÁO: route phía server chạy Claude Code với `--dangerously-skip-permissions` (theo lựa
 * chọn của người dùng) — nghĩa là Claude Code có thể sửa file/chạy lệnh thật trong project đã cấu
 * hình mà KHÔNG hỏi xác nhận, chỉ dựa trên văn bản STT nhận diện được từ giọng nói. Rủi ro cao hơn
 * hẳn Hermes (chỉ trả lời text) nếu STT nghe nhầm. */
export class ClaudeCodeConnector extends VoiceTextBridgeConnector {
  private sessionId: string | null = null;

  constructor(config: ClaudeCodeBackendConfig) {
    super({ language: config.language, ttsProvider: config.ttsProvider });
  }

  protected async fetchAssistantReply(
    userText: string,
    onDelta: (delta: string) => void,
  ): Promise<void> {
    const res = await fetch('/api/claude-code/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: userText, sessionId: this.sessionId }),
    });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Claude Code lỗi (HTTP ${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let resultError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // dòng cuối có thể bị cắt giữa chừng — giữ lại chờ chunk sau

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let json: ClaudeCodeLine;
        try {
          json = JSON.parse(trimmed) as ClaudeCodeLine;
        } catch {
          continue; // dòng NDJSON lỗi/không đầy đủ — bỏ qua, không phải lỗi fatal
        }

        // session_id xuất hiện ngay từ dòng "system/init" đầu tiên — chốt lại 1 lần cho lượt
        // đầu, các lượt sau trong cùng cuộc gọi dùng lại để --resume nối đúng ngữ cảnh.
        if (!this.sessionId && json.session_id) this.sessionId = json.session_id;

        if (json.event?.type === 'content_block_delta' && json.event.delta?.type === 'text_delta') {
          const text = json.event.delta.text ?? '';
          if (text) onDelta(text);
          continue;
        }

        if (json.type === 'result') {
          if (json.is_error) resultError = json.result || 'Claude Code báo lỗi không rõ nguyên nhân.';
        }
      }
    }

    if (resultError) throw new Error(resultError);
  }
}

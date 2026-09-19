import type { AssistantStreamEvent } from '../voice-text-bridge';
import { VoiceTextBridgeConnector } from '../voice-text-bridge';

export interface ClaudeCodeBackendConfig {
  /** Ngôn ngữ cho SpeechRecognition/SpeechSynthesis (BCP-47), vd "vi-VN". */
  language: string;
  /** 'browser' đọc bằng SpeechSynthesis miễn phí có sẵn (chất lượng thấp); 'openai'/'google' gọi
   * TTS thật qua proxy server `/api/tts` (key không lộ ra browser — xem route đó). */
  ttsProvider: 'browser' | 'openai' | 'google';
  /** Session muốn TIẾP TỤC (chọn qua UI, xem `/api/claude-code/sessions/route.ts`) thay vì bắt đầu
   * mới — để trống/undefined = phiên mới. Chỉ quyết định `--resume` cho LƯỢT ĐẦU của connector này;
   * sau đó connector tự dùng session nó (hoặc session được resume) tạo ra. */
  initialSessionId?: string;
}

/** 1 dòng NDJSON thật từ `claude -p ... --output-format stream-json --include-partial-messages`
 * — đã verify tay bằng `claude -p ... --dangerously-skip-permissions` thật (không đoán mù) trước
 * khi viết lại parser này. Chỉ khai type những field connector dùng tới. */
interface ClaudeCodeLine {
  type?: string;
  subtype?: string;
  session_id?: string;
  is_error?: boolean;
  result?: string;
  /** Dòng `type: "user"` là tool_result — Claude Code gói kết quả tool vào 1 message role "user"
   * RIÊNG, không phải field trong dòng `assistant`/`stream_event`. */
  message?: {
    content?: Array<{ type?: string; tool_use_id?: string; content?: unknown; is_error?: boolean }>;
  };
  event?: {
    type?: string;
    index?: number;
    content_block?: { type?: string; id?: string; name?: string };
    delta?: { type?: string; text?: string; thinking?: string; partial_json?: string };
  };
}

/** Theo dõi content block đang mở theo `index` (Claude Code có thể mở nhiều block xen kẽ trong 1
 * message — thinking rồi tool_use rồi lại text) — cần biết block tại 1 index là loại gì để biết
 * delta tiếp theo (vd input_json_delta) thuộc về block nào. `jsonBuffer` gom `partial_json` của
 * tool_use tới lúc `content_block_stop` mới `JSON.parse` được (input tới dạng CHUỖI JSON cắt nhỏ
 * từng phần, không phải object hoàn chỉnh ngay). */
interface OpenBlock {
  type: string;
  id?: string;
  jsonBuffer: string;
}

/** Connector cho Claude Code CLI — chạy `claude -p` ở chế độ headless như 1 subprocess phía
 * server (xem `/api/claude-code/chat/route.ts`), KHÔNG phải 1 Gateway API có sẵn như Hermes.
 * STT/VAD/TTS do `VoiceTextBridgeConnector` lo (chỉ nghe phần text cuối cùng); phần riêng ở đây là
 * gọi route nội bộ và parse đúng NDJSON event schema thật của Claude Code: `content_block_delta`
 * cho text/thinking streaming theo token, `content_block_start`+`input_json_delta`+
 * `content_block_stop` cho tool_use (input tới dạng JSON cắt nhỏ, không phải object ngay),
 * `type: "user"` cho tool_result, và `system/init` cho session_id lần đầu để nối lại lịch sử qua
 * `--resume` ở các lượt sau trong CÙNG 1 cuộc gọi. `projectDir`/đường dẫn binary đọc từ Settings
 * NGAY TRONG route phía server — connector không cần biết/gửi các giá trị đó.
 *
 * CẢNH BÁO: route phía server chạy Claude Code với `--dangerously-skip-permissions` (theo lựa
 * chọn của người dùng) — nghĩa là Claude Code có thể sửa file/chạy lệnh thật trong project đã cấu
 * hình mà KHÔNG hỏi xác nhận, chỉ dựa trên văn bản STT nhận diện được từ giọng nói. Rủi ro cao hơn
 * hẳn Hermes (chỉ trả lời text) nếu STT nghe nhầm. */
/** Dặn model đừng dùng markdown vì trả lời sẽ được đọc thành giọng nói — sửa từ gốc thay vì dọn
 * markdown bằng code sau khi nhận (xem `voice-text-bridge.ts`'s `sanitizeForSpeech`, vẫn giữ làm
 * lưới an toàn cho lúc model không theo đúng chỉ dẫn). Chỉ cần chèn 1 lần lúc bắt đầu session —
 * `--resume` giữ nguyên ngữ cảnh nên các lượt sau không cần lặp lại. */
const VOICE_SYSTEM_NOTE =
  '[Bạn đang trả lời bằng giọng nói qua cuộc gọi thoại — mọi câu trả lời từ giờ trong session này ' +
  'sẽ được đọc lên bằng TTS. Trả lời bằng câu văn nói tự nhiên, ngắn gọn. KHÔNG dùng markdown ' +
  '(không **đậm**, không heading #, không bullet -, không code block ```). Nếu cần nhắc tới code, ' +
  'mô tả bằng lời thay vì dán nguyên đoạn code.]\n\n';

export class ClaudeCodeConnector extends VoiceTextBridgeConnector {
  private sessionId: string | null;
  /** Tách riêng khỏi `sessionId` — khi TIẾP TỤC 1 session cũ (`initialSessionId` khác `--resume`
   * lần đầu tự tạo ra), `sessionId` đã có giá trị NGAY LƯỢT ĐẦU, nhưng session đó chưa chắc từng
   * nhận `VOICE_SYSTEM_NOTE` (vd tạo từ CLI tương tác bình thường, không qua voxta) — vẫn cần chèn
   * lời dặn "đang trả lời bằng giọng nói" vào lượt đầu tiên CỦA CONNECTOR NÀY, bất kể đang resume
   * hay tạo mới. */
  private hasSentFirstPrompt = false;

  constructor(config: ClaudeCodeBackendConfig) {
    super({ language: config.language, ttsProvider: config.ttsProvider });
    this.sessionId = config.initialSessionId?.trim() || null;
  }

  protected async fetchAssistantReply(
    userText: string,
    onDelta: (delta: string) => void,
    onEvent?: (event: AssistantStreamEvent) => void,
  ): Promise<void> {
    const isFirstPrompt = !this.hasSentFirstPrompt;
    this.hasSentFirstPrompt = true;
    const prompt = isFirstPrompt ? VOICE_SYSTEM_NOTE + userText : userText;

    const res = await fetch('/api/claude-code/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, sessionId: this.sessionId }),
    });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Claude Code lỗi (HTTP ${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let resultError: string | null = null;
    const openBlocks = new Map<number, OpenBlock>();

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

        // tool_result nằm trong 1 dòng "user" RIÊNG, không phải field của dòng "assistant"/"event"
        // (đã verify tay — xem comment `ClaudeCodeLine`).
        if (json.type === 'user' && json.message?.content) {
          for (const item of json.message.content) {
            if (item.type === 'tool_result' && item.tool_use_id) {
              onEvent?.({ type: 'tool-result', id: item.tool_use_id, output: item.content });
            }
          }
          continue;
        }

        const event = json.event;
        if (!event) {
          if (json.type === 'result' && json.is_error) {
            resultError = json.result || 'Claude Code báo lỗi không rõ nguyên nhân.';
          }
          continue;
        }

        if (event.type === 'content_block_start' && typeof event.index === 'number') {
          const block = event.content_block;
          openBlocks.set(event.index, { type: block?.type ?? '', id: block?.id, jsonBuffer: '' });
          if (block?.type === 'tool_use' && block.id) {
            onEvent?.({ type: 'tool-call-start', id: block.id, name: block.name ?? 'tool' });
          }
          continue;
        }

        if (event.type === 'content_block_delta' && typeof event.index === 'number') {
          const delta = event.delta;
          const openBlock = openBlocks.get(event.index);
          if (delta?.type === 'text_delta' && delta.text) {
            onDelta(delta.text);
          } else if (delta?.type === 'thinking_delta' && delta.thinking) {
            onEvent?.({ type: 'thinking-delta', text: delta.thinking });
          } else if (delta?.type === 'input_json_delta' && openBlock?.type === 'tool_use') {
            openBlock.jsonBuffer += delta.partial_json ?? '';
          }
          continue;
        }

        if (event.type === 'content_block_stop' && typeof event.index === 'number') {
          const openBlock = openBlocks.get(event.index);
          if (openBlock?.type === 'tool_use' && openBlock.id) {
            // Input tool_use tới dạng CHUỖI JSON cắt nhỏ qua từng `input_json_delta` — chỉ ráp
            // được thành object hoàn chỉnh lúc block đóng lại.
            let input: unknown = {};
            try {
              input = openBlock.jsonBuffer ? JSON.parse(openBlock.jsonBuffer) : {};
            } catch {
              input = openBlock.jsonBuffer; // JSON lỗi (hiếm) — hiện nguyên chuỗi thô còn hơn mất thông tin
            }
            onEvent?.({ type: 'tool-call-input', id: openBlock.id, input });
          }
          openBlocks.delete(event.index);
          continue;
        }
      }
    }

    if (resultError) throw new Error(resultError);
  }
}

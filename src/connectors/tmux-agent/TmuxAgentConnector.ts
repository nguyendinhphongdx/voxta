import { VoiceTextBridgeConnector } from '../voice-text-bridge';

export interface TmuxAgentBackendConfig {
  /** Ngôn ngữ cho SpeechRecognition/SpeechSynthesis (BCP-47), vd "vi-VN". */
  language: string;
  /** 'browser' đọc bằng SpeechSynthesis miễn phí có sẵn (chất lượng thấp); 'openai'/'google' gọi
   * TTS thật qua proxy server `/api/tts` (key không lộ ra browser — xem route đó). */
  ttsProvider: 'browser' | 'openai' | 'google';
}

/** Connector generic cho BẤT KỲ CLI agent tương tác nào (Codex, Claude Code, Aider...) — điều
 * khiển bằng cách gõ phím + chụp màn hình tmux (`lib/tmux-agent.ts`, `/api/tmux-agent/*`) thay vì
 * dựa vào flag/schema JSON riêng của từng agent như `ClaudeCodeConnector`. Đổi lại KHÔNG có
 * streaming theo token thật — mỗi lượt trả về nguyên 1 cục text sau khi màn hình "đứng yên", rồi
 * `VoiceTextBridgeConnector` mới bắt đầu cắt câu/đọc như bình thường (đã verify tay với `codex`
 * thật: `send-keys "text" Enter` gộp 1 lệnh không submit được, phải tách 2 lệnh — xem
 * `lib/tmux-agent.ts` để biết chi tiết đã tái hiện). */
export class TmuxAgentConnector extends VoiceTextBridgeConnector {
  private sessionName: string | null = null;

  constructor(config: TmuxAgentBackendConfig) {
    super({ language: config.language, ttsProvider: config.ttsProvider });
  }

  protected async fetchAssistantReply(
    userText: string,
    onDelta: (delta: string) => void,
  ): Promise<void> {
    if (!this.sessionName) {
      const res = await fetch('/api/tmux-agent/start', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as
        | { sessionName?: string; error?: string }
        | null;
      if (!res.ok || !body?.sessionName) {
        throw new Error(body?.error ?? `Không bắt đầu được session tmux (HTTP ${res.status})`);
      }
      this.sessionName = body.sessionName;
    }

    const res = await fetch('/api/tmux-agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionName: this.sessionName, text: userText }),
    });
    const body = (await res.json().catch(() => null)) as { reply?: string; error?: string } | null;
    if (!res.ok) throw new Error(body?.error ?? `Lỗi tmux agent (HTTP ${res.status})`);

    const reply = body?.reply ?? '';
    if (reply) onDelta(reply); // 1 cục — không streaming theo token được (xem class doc ở trên)
  }

  protected onClose(): void {
    if (!this.sessionName) return;
    const sessionName = this.sessionName;
    this.sessionName = null;
    // Fire-and-forget: close() không phải async, và cuộc gọi đã kết thúc rồi nên không cần chờ
    // kết quả — chỉ cần dọn session tmux khỏi bị treo lại chạy nền vô thời hạn.
    void fetch('/api/tmux-agent/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionName }),
    }).catch(() => {
      // Không có gì để làm nếu request dọn dẹp thất bại — session sẽ vẫn nằm đó, nhưng không có
      // gì đọc/ghi vào nó nữa từ voxta.
    });
  }
}

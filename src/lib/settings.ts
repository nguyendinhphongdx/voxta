/** Settings lưu qua SQLite (API `/api/settings`, xem `lib/db.ts`) — voxta 1 người dùng, không có
 * account/multi-tenant. Trước đây dùng localStorage nhưng mỗi browser có 1 bản riêng, không đồng
 * bộ giữa các browser/thiết bị cùng trỏ vào 1 server voxta. */

export interface VoxtaSettings {
  backend: 'ultron' | 'hermes' | 'claude-code';
  apiBaseUrl: string;
  agentId: number | null;
  /** Base URL của Hermes Gateway API (OpenAI-compatible), vd http://localhost:8642. */
  hermesGatewayUrl: string;
  /** `API_SERVER_KEY` cấu hình trên Hermes. */
  hermesApiKey: string;
  /** Tên model Hermes route tới — để trống dùng mặc định server. */
  hermesModel: string;
  /** Thư mục project Claude Code CLI sẽ chạy trong đó (đọc/sửa file, chạy lệnh thật — xem cảnh
   * báo ở `/api/claude-code/chat/route.ts`). */
  claudeCodeProjectDir: string;
  /** Lệnh/đường dẫn chạy `claude` CLI — mặc định "claude" (tra theo PATH của process chạy
   * server). Process server có thể có PATH khác hẳn terminal tương tác của bạn (vd cài qua nvm —
   * PATH của nvm chỉ được set qua rc file của shell tương tác, process không tương tác/không qua
   * shell login sẽ không thấy) — nếu vậy điền đường dẫn tuyệt đối (`which claude` để lấy). */
  claudeCodeBinaryPath: string;
  /** Giọng đọc trả lời — dùng chung cho các backend chỉ có text (Hermes, Claude Code). 'browser'
   * dùng SpeechSynthesis miễn phí có sẵn trong trình duyệt (chất lượng thấp); 'openai'/'google'
   * gọi TTS thật qua proxy server (`/api/tts`) để key không lộ ra browser. */
  ttsProvider: 'browser' | 'openai' | 'google';
  openaiApiKey: string;
  openaiTtsModel: string;
  openaiTtsVoice: string;
  googleApiKey: string;
  /** Tên giọng đầy đủ theo catalog Google, vd "vi-VN-Wavenet-A" — cũng dùng để suy ra
   * languageCode (2 segment đầu). */
  googleTtsVoice: string;
}

export const DEFAULT_SETTINGS: VoxtaSettings = {
  backend: 'ultron',
  apiBaseUrl: 'http://localhost:8000',
  agentId: null,
  hermesGatewayUrl: 'http://localhost:8642',
  hermesApiKey: '',
  hermesModel: '',
  claudeCodeProjectDir: '',
  claudeCodeBinaryPath: 'claude',
  ttsProvider: 'browser',
  openaiApiKey: '',
  openaiTtsModel: 'gpt-4o-mini-tts',
  openaiTtsVoice: 'alloy',
  googleApiKey: '',
  googleTtsVoice: 'vi-VN-Wavenet-A',
};

export async function fetchSettings(): Promise<VoxtaSettings> {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...((await res.json()) as Partial<VoxtaSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: VoxtaSettings): Promise<void> {
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

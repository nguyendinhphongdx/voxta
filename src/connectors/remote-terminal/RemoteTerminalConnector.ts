import { Terminal } from '@xterm/headless';

import { useOtpPromptStore } from '../../features/conversation/otp-prompt-store';
import { VoiceTextBridgeConnector } from '../voice-text-bridge';

/** Kích thước PTY tạo qua `terminal:create` — dùng lại đúng số này khi "chạy" output qua
 * `@xterm/headless` bên dưới, vì cách ngắt dòng/căn cột phụ thuộc trực tiếp vào cols/rows đã
 * thoả thuận với PTY thật ở phía agent. */
export const TERMINAL_COLS = 120;
export const TERMINAL_ROWS = 30;

export interface RemoteTerminalBackendConfig {
  /** URL relay của vscode-remote, vd "https://your-relay.example.com" (http/https hoặc ws/wss đều
   * nhận — tự chuẩn hoá qua `toHttpBase`/`toWsBase`). */
  relayUrl: string;
  machineId: string;
  password: string;
  language: string;
  ttsProvider: 'browser' | 'openai' | 'google';
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/** Cache theo machineId, dùng CHUNG giữa MỌI instance connector (kể cả connector riêng của chat
 * text và của Live — xem `agent-session.ts`) — token relay sống 24h (theo thiết kế vscode-remote),
 * không cần hỏi lại OTP mỗi lần tạo connector mới trong ngày. */
const tokenCache = new Map<string, CachedToken>();

function toHttpBase(relayUrl: string): string {
  return relayUrl.trim().replace(/^ws/, 'http').replace(/\/$/, '');
}
function toWsBase(relayUrl: string): string {
  return relayUrl.trim().replace(/^http/, 'ws').replace(/\/$/, '');
}

/** Sau ngần này không có chunk `terminal:output` mới -> coi là agent/shell đã tạm ngừng, chốt 1
 * "đoạn" để đọc/hiện. Khác hẳn Terminal Agent (tmux) — ở đó "xong" suy ra bằng cách CHỤP MÀN HÌNH
 * lặp lại tới khi giống hệt nhau (poll), còn ở đây output là EVENT ĐẨY VỀ qua WebSocket, không có
 * gì để "chụp". */
const QUIET_MS = 900;
/** Trần cho output LIÊN TỤC không bao giờ im lặng đủ `QUIET_MS` (vd `tail -f`, build watcher) —
 * không có trần này thì phải đợi tới im lặng hẳn (có thể rất lâu hoặc không bao giờ) mới chốt
 * đoạn để đọc, dồn thành 1 cục khổng lồ khó nghe. Đọc theo từng đoạn ~8s một khi đang chảy liên
 * tục, thay vì 1 lần duy nhất sau cả phút im lặng. */
const MAX_CHUNK_MS = 8_000;
/** Trần AN TOÀN tuyệt đối cho riêng lượt voice/gõ lệnh (`fetchAssistantReply`) — phòng trường hợp
 * hiếm background reader vì lý do gì đó không tự chốt được (vd lỗi không lường trước), lượt gọi
 * vẫn phải kết thúc, không treo vô thời hạn. */
const MAX_WAIT_MS = 5 * 60_000;

interface RelayMessage {
  id?: string;
  type?: string;
  success?: boolean;
  payload?: unknown;
  error?: string;
}

/** Ghi `raw` vào `term` (1 terminal emulator thật — `@xterm/headless`, không đụng DOM, chạy được
 * cả browser lẫn Node) và đợi tới khi ghi xong mới resolve — `term.write()` xử lý bất đồng bộ qua
 * hàng đợi nội bộ, đọc buffer ngay sau khi gọi (không đợi callback) có thể đọc phải state chưa
 * cập nhật xong. */
function writeToScreen(term: Terminal, raw: string): Promise<void> {
  return new Promise((resolve) => term.write(raw, () => resolve()));
}

/** Vị trí dòng tuyệt đối cursor đang đứng trong buffer (kể cả phần đã cuộn vào scrollback) — mốc
 * để biết "đã đọc/nói tới đâu rồi", KHÔNG dùng `buffer.length` (chỉ tăng khi nội dung cuộn VƯỢT
 * quá `rows` ban đầu — output ngắn nằm gọn trong viewport thì `length` đứng yên, không phản ánh
 * gì cả). `baseY + cursorY` luôn tăng đúng theo dòng mới nhất vừa ghi, dù có cuộn hay không. */
function absoluteCursorRow(term: Terminal): number {
  const buffer = term.buffer.active;
  return buffer.baseY + buffer.cursorY;
}

/** Đọc lại text đã render từ dòng `startRow` tới dòng cursor hiện tại — dùng `translateToString`
 * của xterm.js nên khoảng cách do cursor-movement tạo ra (nhiều TUI vẽ bằng cách nhảy cột thay vì
 * gõ dấu cách — vd hộp thoại trust của Claude Code) và hyperlink OSC-8 kết thúc bằng ST (`ESC \`,
 * escape sequence dạng này lọt qua được cách xoá ANSI bằng regex thô trước đây) đều ra đúng. */
function readScreenSince(term: Terminal, startRow: number): string {
  const buffer = term.buffer.active;
  const endRow = absoluteCursorRow(term);
  const lines: string[] = [];
  for (let i = startRow; i <= endRow && i < buffer.length; i++) {
    lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  // Bỏ dòng cuối nếu chỉ là prompt trơ (vd `>`, `$`, `❯`) — sau khi trả lời xong, CLI thường vẽ
  // ngay dòng prompt rỗng chờ lệnh kế tiếp, dòng đó lọt vào watermark (cursor đã đứng ở đó) nhưng
  // không phải nội dung câu trả lời — đọc to ra chỉ là tiếng "dấu ngoặc" vô nghĩa. Heuristic: dòng
  // cuối ngắn (≤4 ký tự sau khi trim) và không có chữ/số nào thì coi là prompt, bỏ đi.
  const last = lines[lines.length - 1]?.trim() ?? '';
  if (last.length > 0 && last.length <= 4 && !/[\p{L}\p{N}]/u.test(last)) lines.pop();
  return lines.join('\n');
}

/** Client nói đúng giao thức WebSocket của relay `vscode-remote` — đã đọc code thật của repo đó để
 * verify trước khi viết (shared/src/protocol.ts, relay/server/browserHandler.ts,
 * relay/server/routes/auth.ts), không đoán mù. KHÔNG tự vận hành relay riêng: voxta chỉ là 1
 * "browser" client nữa nói cùng giao thức, dùng CHUNG relay + agent đã cài sẵn cho vscode-remote
 * (agent chạy `opencode start` trên máy đích) — relay broadcast `terminal:output` cho MỌI client
 * cùng machineId, không phân biệt app nào kết nối.
 *
 * Nếu SSH thẳng vào máy đích được, dùng Terminal Agent (tmux) với lệnh `ssh user@host` đơn giản
 * hơn nhiều và không phụ thuộc relay của bên thứ 3 — chỉ dùng backend này khi máy đích đứng sau
 * NAT/không SSH thẳng được và đã có sẵn agent+relay của vscode-remote.
 *
 * CẢNH BÁO CHƯA VERIFY ĐƯỢC END-TO-END lúc viết file này: relay demo (Railway) đang sập, và
 * `terminal:create` không test được cả trên relay chạy local vì `node-pty` không spawn được PTY
 * trong môi trường sandbox lúc code. Đã verify riêng auth login + WebSocket connect/authenticate
 * (chạy thật, nhanh, ổn định — xem lịch sử trò chuyện) nhưng CHƯA verify được toàn bộ vòng gõ lệnh
 * → nhận output thật. Test kỹ với relay/agent thật trước khi tin tưởng dùng. */
export class RemoteTerminalConnector extends VoiceTextBridgeConnector {
  private readonly remoteConfig: RemoteTerminalBackendConfig;
  private ws: WebSocket | null = null;
  private terminalId: string | null = null;
  private readonly outputHandlers = new Set<(chunk: string) => void>();
  private readonly pendingRequests = new Map<string, (msg: RelayMessage) => void>();
  /** Ai đang cần biết NGAY khi socket chết giữa chừng (thay vì tự đoán qua timeout) — đăng ký ở
   * đây, gọi 1 lần rồi bị `handleSocketDown` xoá sạch. Dùng cho `openSocket()` (đang chờ mở/xác
   * thực) và `fetchAssistantReply` (đang chờ output) — cả 2 chỗ đó không có cách nào khác để biết
   * relay đã đóng kết nối. */
  private readonly socketDownHandlers = new Set<(err: Error) => void>();
  /** Mô hình "màn hình" PERSISTENT của phiên PTY hiện tại — sống suốt vòng đời connector (không
   * tạo mới mỗi lượt như trước), để `fetchAssistantReply` biết chính xác đã đọc/nói tới dòng nào
   * rồi (xem `readScreenSince`). Reset (dispose + null) mỗi khi `createTerminal()` mở 1 PHIÊN PTY
   * MỚI (sau khi socket chết phải reconnect) — phiên mới không liên quan gì tới nội dung màn hình
   * cũ. `scrollback` để rộng (10k dòng) để mốc dòng tuyệt đối không bị lệch do bị đẩy khỏi buffer
   * trong 1 phiên dài — không xử lý chính xác trường hợp tràn scrollback, chấp nhận như giới hạn
   * v1 (phiên dài cỡ đó hiếm khi xảy ra giữa 2 lượt voice/gõ liên tiếp). */
  private screen: Terminal | null = null;
  /** Mốc đọc DÙNG CHUNG giữa lượt voice/gõ lệnh (`fetchAssistantReply`) và output nền/gõ tay trực
   * tiếp vào xterm.js — chỉ 1 mốc duy nhất cho cả connector, để KHÔNG có 2 cơ chế đọc chồng lấn
   * (mỗi khoảng lặng chỉ được đọc đúng 1 lần, bất kể do ai gây ra). */
  private lastReadRow = 0;
  private backgroundReaderHandler: ((chunk: string) => void) | null = null;
  /** Voice turn nào đang CHỜ đúng đoạn output kế tiếp — background reader ưu tiên trả cho nó thay
   * vì tự đọc to luôn (để base class's `streamReply` lo phần TTS của luồng hỏi-đáp bình thường).
   * `null` nghĩa là không ai đang chờ — khoảng lặng tiếp theo (nếu có nội dung) là do gõ tay/tiến
   * trình nền, tự `speak()` luôn nếu `autoReadOutput` đang bật. */
  private pendingVoiceRead: ((text: string) => void) | null = null;
  /** Bật/tắt qua `setAutoReadOutput` — panel `/live-terminal` có nút toggle riêng (không đụng gì
   * tới lượt voice: hỏi bằng giọng nói LUÔN được đọc trả lời, cờ này chỉ kiểm soát việc tự đọc to
   * output xuất hiện KHÔNG do 1 câu hỏi cụ thể — gõ tay trực tiếp, hoặc tiến trình chạy nền). */
  private autoReadOutput = true;

  constructor(config: RemoteTerminalBackendConfig) {
    super({ language: config.language, ttsProvider: config.ttsProvider });
    this.remoteConfig = config;
  }

  private ensureScreen(): Terminal {
    if (!this.screen) {
      // `allowProposedApi` bắt buộc — `.buffer` (đọc lại nội dung đã render) vẫn là proposed API
      // của xterm.js, không bật cờ này thì `term.buffer` throw ngay khi truy cập.
      this.screen = new Terminal({
        cols: TERMINAL_COLS,
        rows: TERMINAL_ROWS,
        allowProposedApi: true,
        scrollback: 10_000,
      });
    }
    return this.screen;
  }

  /** Đăng ký (1 lần) handler theo dõi output — CHỐT 1 "đoạn" để đọc/hiện khi im lặng `QUIET_MS`,
   * hoặc cưỡng bức sau mỗi `MAX_CHUNK_MS` nếu output cứ chảy liên tục không bao giờ im lặng đủ
   * lâu (xem comment `MAX_CHUNK_MS`). Đây là NƠI DUY NHẤT quyết định "đoạn nào vừa xong" — cả
   * `fetchAssistantReply` (voice/gõ lệnh) lẫn gõ tay trực tiếp/tiến trình nền đều đi qua đây,
   * tránh 2 cơ chế đọc độc lập giẫm lên nhau. */
  private startBackgroundReader(): void {
    if (this.backgroundReaderHandler) return;

    let raw = '';
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let chunkCeilTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = async () => {
      if (quietTimer) {
        clearTimeout(quietTimer);
        quietTimer = null;
      }
      if (chunkCeilTimer) {
        clearTimeout(chunkCeilTimer);
        chunkCeilTimer = null;
      }
      if (!raw) return;
      const chunk = raw;
      raw = '';

      const screen = this.ensureScreen();
      await writeToScreen(screen, chunk);
      const text = readScreenSince(screen, this.lastReadRow).trim();
      this.lastReadRow = absoluteCursorRow(screen);

      if (this.pendingVoiceRead) {
        const resolve = this.pendingVoiceRead;
        this.pendingVoiceRead = null;
        resolve(text);
      } else if (text && this.autoReadOutput) {
        this.speak(text);
      }
    };

    const handler = (piece: string) => {
      raw += piece;
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => void flush(), QUIET_MS);
      if (!chunkCeilTimer) chunkCeilTimer = setTimeout(() => void flush(), MAX_CHUNK_MS);
    };

    this.backgroundReaderHandler = handler;
    this.outputHandlers.add(handler);
  }

  protected async fetchAssistantReply(userText: string, onDelta: (delta: string) => void): Promise<void> {
    await this.ensureTerminalReady();

    let resolveText: ((text: string) => void) | null = null;
    let rejectText: ((err: Error) => void) | null = null;
    const waitForRead = new Promise<string>((resolve, reject) => {
      resolveText = resolve;
      rejectText = reject;
    });
    this.pendingVoiceRead = (text) => resolveText?.(text);

    // Trần an toàn cuối cùng — xem comment `MAX_WAIT_MS`.
    const hardTimeout = setTimeout(() => resolveText?.(''), MAX_WAIT_MS);
    // Relay/socket chết giữa chừng lúc đang đợi output — báo lỗi ngay, khỏi chờ hết MAX_WAIT_MS.
    const onSocketDown = (err: Error) => rejectText?.(err);
    this.socketDownHandlers.add(onSocketDown);

    let text: string;
    try {
      // `\r`, not `\n` — PTYs (đặc biệt ConPTY trên Windows) coi `\r` là phím Enter thật sự
      // submit dòng lệnh; gửi `\n` khiến PowerShell/PSReadLine hiểu là chưa xong dòng, hiện
      // prompt tiếp diễn `>>` và cộng dồn input của các lượt sau vào cùng 1 buffer chưa submit.
      await this.sendTerminalInput(`${userText}\r`);
      text = await waitForRead;
    } finally {
      clearTimeout(hardTimeout);
      this.socketDownHandlers.delete(onSocketDown);
      // Phòng timeout/lỗi xảy ra TRƯỚC khi background reader kịp flush — dọn tay chờ dở, không để
      // 1 flush muộn sau này trả nhầm cho lượt đã kết thúc.
      this.pendingVoiceRead = null;
    }

    onDelta(text);
  }

  /** Bật/tắt tự đọc to output KHÔNG gắn với 1 câu hỏi cụ thể (gõ tay trực tiếp vào xterm.js, hoặc
   * tiến trình chạy nền) — dùng cho toggle trong panel `/live-terminal`. Không ảnh hưởng lượt
   * voice: hỏi bằng giọng nói luôn được đọc trả lời qua `fetchAssistantReply`/`onDelta` như cũ. */
  setAutoReadOutput(enabled: boolean): void {
    this.autoReadOutput = enabled;
  }

  /** Kết nối/tạo phiên PTY ngay nếu chưa có — dùng cho panel terminal tương tác (`/live-terminal`)
   * muốn hiện shell prompt sẵn ngay khi cuộc gọi bắt đầu, không cần đợi lượt voice/gõ đầu tiên
   * (`fetchAssistantReply` vốn tự gọi hàm này lazily). */
  async connectTerminal(): Promise<void> {
    await this.ensureTerminalReady();
  }

  /** Subscribe output thô LIVE (không đợi quiet-period buffer như `fetchAssistantReply`) — dùng
   * để feed thẳng vào `term.write()` của xterm.js DOM. Trả về hàm unsubscribe. */
  onRawOutput(handler: (chunk: string) => void): () => void {
    this.outputHandlers.add(handler);
    return () => this.outputHandlers.delete(handler);
  }

  /** Gửi thẳng byte thô vào PTY — dùng cho `term.onData()` của xterm.js (gõ từng phím, Ctrl+C,
   * mũi tên...), khác `fetchAssistantReply` vốn tự thêm `\r` và đợi quiet-period. Caller tự đảm
   * bảo đã `connectTerminal()` trước. */
  writeRaw(data: string): Promise<void> {
    return this.sendTerminalInput(data);
  }

  /** Báo PTY thật đổi kích thước (panel xterm.js DOM tự `fit()` theo container qua `FitAddon`) —
   * không có bước này thì PTY vẫn nghĩ mình đang ở kích thước lúc `terminal:create`, chương trình
   * bên trong (ls cột, TUI...) ngắt dòng sai so với những gì DOM đang hiển thị. Đồng thời resize
   * luôn `screen` (mô hình dùng cho TTS-diff) theo cho khớp — không thì 2 bên lệch kích thước,
   * `readScreenSince` tính dòng sai. No-op an toàn nếu terminal chưa tạo (`this.terminalId` null). */
  resizeTerminal(cols: number, rows: number): void {
    this.screen?.resize(cols, rows);
    if (!this.ws || !this.terminalId) return;
    this.ws.send(
      JSON.stringify({
        id: crypto.randomUUID(),
        type: 'terminal:resize',
        payload: { terminalId: this.terminalId, cols, rows },
      }),
    );
  }

  private async ensureTerminalReady(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.terminalId) return;
    const token = await this.ensureToken();
    await this.openSocket(token);
    this.terminalId = await this.createTerminal();
    // Phiên PTY mới hoàn toàn (lần đầu connect, hoặc reconnect sau khi socket cũ chết) — màn hình
    // cũ (nếu có) không còn phản ánh đúng phiên này nữa, dispose để `ensureScreen()` tạo lại sạch.
    this.screen?.dispose();
    this.screen = null;
    this.lastReadRow = 0;
    // Handler cũ (nếu có) đóng trên state của socket vừa chết — bỏ hẳn thay vì để tồn đọng trong
    // `outputHandlers` (không hại gì vì socket cũ không còn bắn chunk nữa, nhưng dọn cho sạch).
    if (this.backgroundReaderHandler) {
      this.outputHandlers.delete(this.backgroundReaderHandler);
      this.backgroundReaderHandler = null;
    }
    this.startBackgroundReader();
  }

  /** Login relay, hỏi OTP qua `useOtpPromptStore` nếu agent bật 2FA — KHÔNG lưu OTP/TOTP secret ở
   * đâu cả, chỉ cache token cuối cùng (sống 24h theo thiết kế vscode-remote). */
  private async ensureToken(): Promise<string> {
    const cached = tokenCache.get(this.remoteConfig.machineId);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    const httpBase = toHttpBase(this.remoteConfig.relayUrl);
    const loginRes = await fetch(`${httpBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId: this.remoteConfig.machineId, password: this.remoteConfig.password }),
    });
    const loginBody = (await loginRes.json().catch(() => null)) as
      | { token?: string; expiresAt?: number; requireOtp?: boolean; otpSession?: string; error?: string }
      | null;
    if (!loginRes.ok) throw new Error(loginBody?.error ?? `Đăng nhập relay lỗi (HTTP ${loginRes.status})`);

    if (loginBody?.requireOtp && loginBody.otpSession) {
      const code = await useOtpPromptStore.getState().requestOtp(this.remoteConfig.machineId);
      const otpRes = await fetch(`${httpBase}/api/auth/otp-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: this.remoteConfig.machineId, otpSession: loginBody.otpSession, code }),
      });
      const otpBody = (await otpRes.json().catch(() => null)) as
        | { token?: string; expiresAt?: number; error?: string }
        | null;
      if (!otpRes.ok || !otpBody?.token) throw new Error(otpBody?.error ?? 'Mã OTP không đúng.');
      tokenCache.set(this.remoteConfig.machineId, { token: otpBody.token, expiresAt: otpBody.expiresAt ?? 0 });
      return otpBody.token;
    }

    if (!loginBody?.token) throw new Error('Relay không trả về token đăng nhập.');
    tokenCache.set(this.remoteConfig.machineId, { token: loginBody.token, expiresAt: loginBody.expiresAt ?? 0 });
    return loginBody.token;
  }

  private openSocket(token: string): Promise<void> {
    const wsBase = toWsBase(this.remoteConfig.relayUrl);
    const ws = new WebSocket(`${wsBase}/api/ws?machineId=${encodeURIComponent(this.remoteConfig.machineId)}`);
    this.ws = ws;

    ws.addEventListener('message', (event) => {
      let msg: RelayMessage;
      try {
        msg = JSON.parse(event.data as string) as RelayMessage;
      } catch {
        return;
      }

      if (msg.type === 'terminal:output') {
        const payload = msg.payload as { terminalId?: string; data?: string } | undefined;
        if (payload?.terminalId === this.terminalId && payload.data) {
          for (const handler of this.outputHandlers) handler(payload.data);
        }
        return;
      }

      if (msg.id && this.pendingRequests.has(msg.id)) {
        const resolve = this.pendingRequests.get(msg.id);
        this.pendingRequests.delete(msg.id);
        resolve?.(msg);
      }
    });

    // Relay đóng kết nối (idle timeout, restart server...) hoặc lỗi mạng giữa chừng — không bắt 2
    // sự kiện này thì mọi `request()` đang chờ phản hồi (và `fetchAssistantReply` đang chờ output)
    // sẽ treo VĨNH VIỄN, vì relay không còn cách nào gửi tiếp phản hồi cho request đã gửi trước đó.
    ws.addEventListener('close', () => this.handleSocketDown(ws, new Error('Mất kết nối relay.')));
    ws.addEventListener('error', () =>
      this.handleSocketDown(ws, new Error('Không kết nối được relay (WebSocket lỗi).')),
    );

    return new Promise((resolve, reject) => {
      // Nếu socket chết TRƯỚC KHI kịp mở/xác thực (mạng lỗi, relay sập...) thì `request()` ở dưới
      // chưa bao giờ được gọi — không có gì trong `pendingRequests` để `handleSocketDown` reject
      // hộ, nên tự đăng ký reject trực tiếp ở đây.
      const onDown = (err: Error) => reject(err);
      this.socketDownHandlers.add(onDown);

      ws.addEventListener('open', () => {
        this.request('auth:authenticate', { token })
          .then((res) => {
            this.socketDownHandlers.delete(onDown);
            if (res.success) resolve();
            else reject(new Error(res.error ?? 'Xác thực relay thất bại.'));
          })
          .catch((err: Error) => {
            this.socketDownHandlers.delete(onDown);
            reject(err);
          });
      });
    });
  }

  /** Chốt 1 lần khi socket hiện tại chết — reject hộ mọi request đang treo (`pendingRequests`) và
   * báo cho ai đang chờ khác (`socketDownHandlers`, vd `fetchAssistantReply` đang chờ output),
   * thay vì để chúng treo tới khi hết timeout (hoặc vĩnh viễn, với `request()` vốn không có
   * timeout riêng). So sánh `this.ws !== ws` để bỏ qua sự kiện muộn của 1 socket đã bị thay bởi
   * kết nối mới hơn (reconnect) — tránh xoá nhầm state của socket đang dùng. */
  private handleSocketDown(ws: WebSocket, err: Error): void {
    if (this.ws !== ws) return;
    this.ws = null;
    this.terminalId = null;
    for (const resolve of this.pendingRequests.values()) resolve({ success: false, error: err.message });
    this.pendingRequests.clear();
    const handlers = [...this.socketDownHandlers];
    this.socketDownHandlers.clear();
    for (const handler of handlers) handler(err);
  }

  private request(type: string, payload: unknown): Promise<RelayMessage> {
    if (!this.ws) return Promise.reject(new Error('Chưa kết nối relay.'));
    const id = crypto.randomUUID();
    const ws = this.ws;
    return new Promise((resolve) => {
      this.pendingRequests.set(id, resolve);
      ws.send(JSON.stringify({ id, type, payload }));
    });
  }

  private async createTerminal(): Promise<string> {
    const res = await this.request('terminal:create', { cols: TERMINAL_COLS, rows: TERMINAL_ROWS });
    const payload = res.payload as { terminalId?: string } | undefined;
    if (!res.success || !payload?.terminalId) {
      throw new Error(res.error ?? 'Không tạo được terminal trên máy đích.');
    }
    return payload.terminalId;
  }

  private async sendTerminalInput(data: string): Promise<void> {
    if (!this.ws || !this.terminalId) throw new Error('Terminal chưa sẵn sàng.');
    this.ws.send(
      JSON.stringify({ id: crypto.randomUUID(), type: 'terminal:input', payload: { terminalId: this.terminalId, data } }),
    );
  }

  protected onClose(): void {
    if (this.terminalId && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({ id: crypto.randomUUID(), type: 'terminal:close', payload: { terminalId: this.terminalId } }),
      );
    }
    this.ws?.close();
    this.ws = null;
    this.terminalId = null;
    this.screen?.dispose();
    this.screen = null;
  }
}

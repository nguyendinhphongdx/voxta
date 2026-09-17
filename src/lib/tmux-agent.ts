import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Điều khiển 1 CLI agent tương tác (Codex, Claude Code, hay bất kỳ TUI nào chạy trong terminal)
 * bằng cách gõ/đọc màn hình qua tmux — KHÁC hẳn `voice-text-bridge`+`ClaudeCodeConnector` (vốn
 * chỉ nói được với Claude Code qua flag `--output-format stream-json` riêng của nó). Cách này
 * generic cho mọi CLI agent vì tmux không quan tâm chương trình gì đang chạy trong pane, chỉ gõ
 * phím + chụp màn hình — đổi lại KHÔNG streaming theo token thật được (phải đợi màn hình "đứng
 * yên" mới biết model nói xong, không có event delta rõ ràng như JSON), và phải tự parse chữ ra
 * khỏi khung UI (border, tip, status bar) thay vì nhận thẳng structured event.
 *
 * Đã verify bằng tay với `codex` thật trước khi viết file này (không đoán mù):
 * - `tmux send-keys -t <s> "text" Enter` GỘP 1 lệnh KHÔNG submit được — phải gửi text và Enter
 *   thành 2 lệnh `send-keys` riêng.
 * - Codex hiển thị mỗi lượt dạng `› <text user gửi>` rồi `• <dòng đầu trả lời>` + các dòng tiếp
 *   theo thụt lề 2 space (không có bullet) — quay lại trạng thái rảnh thì input placeholder hiện
 *   lại "Use /skills to list available skills".
 */

const POLL_INTERVAL_MS = 600;
const STABLE_POLLS_REQUIRED = 2; // màn hình không đổi 2 lần liên tiếp mới coi là "xong"
const MAX_WAIT_MS = 5 * 60_000; // agent có thể chạy tool lâu — chờ tối đa 5 phút/lượt

async function tmux(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('tmux', args);
  return stdout;
}

/** Cache theo tên binary trong process — chỉ cần dò lại login shell 1 lần cho tới khi server
 * restart, không phải mỗi lần bắt đầu cuộc gọi. */
const resolvedBinaryCache = new Map<string, string>();

/** `tmux new-session <command>` chạy `command` KHÔNG qua shell tương tác của user — nvm/asdf/...
 * chỉ set PATH qua rc file của shell TƯƠNG TÁC, nên 1 tên trần như "claude" (cài qua nvm/curl vào
 * `~/.local/bin`) có thể "command not found" ngay trong tmux dù terminal của bạn gõ `claude` chạy
 * bình thường — ĐÃ tái hiện thật lỗi này với "claude" (tmux pane chết ngay sau khi tạo), trong khi
 * "codex" tình cờ nằm sẵn trong PATH tmux kế thừa nên không lộ ra. Tự mở 1 login+interactive shell
 * hỏi lại PATH thật trước khi truyền cho tmux — cùng cách `/api/claude-code/chat/route.ts` đã làm
 * cho backend Claude Code headless. */
async function resolveViaLoginShell(binary: string): Promise<string | null> {
  if (resolvedBinaryCache.has(binary)) return resolvedBinaryCache.get(binary) ?? null;
  const shell = process.env.SHELL || '/bin/zsh';
  try {
    const { stdout } = await execFileAsync(shell, ['-lic', `command -v ${binary}`], { timeout: 5000 });
    const resolved = stdout.trim().split('\n').pop()?.trim();
    if (resolved) resolvedBinaryCache.set(binary, resolved);
    return resolved ?? null;
  } catch {
    return null; // shell tương tác cũng không thấy — thật sự chưa cài, không phải vấn đề PATH
  }
}

/** Thay tên binary (từ đầu tiên của `command`, vd "claude" trong "claude") bằng đường dẫn tuyệt
 * đối nếu dò được — giữ nguyên phần còn lại (flag nếu người dùng có gõ thêm). Dò thất bại thì trả
 * nguyên `command` gốc, để tmux tự báo lỗi rõ ràng nếu thật sự chưa cài. */
async function resolveCommand(command: string): Promise<string> {
  const [binary, ...rest] = command.trim().split(/\s+/);
  if (!binary) return command;
  const resolved = await resolveViaLoginShell(binary);
  if (!resolved) return command;
  return [resolved, ...rest].join(' ');
}

export async function sessionExists(name: string): Promise<boolean> {
  try {
    await execFileAsync('tmux', ['has-session', '-t', name]);
    return true;
  } catch {
    return false;
  }
}

/** `spawn` với `detached: true` (thay vì `execFileAsync` như các lệnh tmux khác) — quan trọng:
 * tmux client vừa gọi tự fork ra tmux SERVER (daemon sống độc lập, giữ session sau khi client
 * thoát). Nếu không tách hẳn khỏi process group của Node, 1 số môi trường host (vd process
 * manager dọn theo process group sau mỗi request) có thể vô tình giết luôn server tmux mới tạo
 * — đã tái hiện thật lỗi này: session chết ngay sau khi tạo dù chạy tay y hệt lệnh thì sống bình
 * thường. `detached: true` gọi `setsid()`, đưa toàn bộ cây tiến trình (client + server nó fork
 * ra) vào 1 session hệ điều hành riêng, không còn chung nhóm với Node nữa. */
export async function startSession(name: string, command: string, cwd: string): Promise<void> {
  const resolvedCommand = await resolveCommand(command);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'tmux',
      ['new-session', '-d', '-s', name, '-x', '220', '-y', '50', '-c', cwd, resolvedCommand],
      { cwd, detached: true, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      child.unref();
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `tmux new-session thoát với code ${code}`));
    });
  });
}

export async function killSession(name: string): Promise<void> {
  try {
    await execFileAsync('tmux', ['kill-session', '-t', name]);
  } catch {
    // Đã chết sẵn (session tự thoát, hay đã bị kill trước đó) — không phải lỗi cần báo.
  }
}

export async function capture(name: string): Promise<string> {
  return tmux(['capture-pane', '-t', name, '-p', '-S', '-2000']);
}

/** Gửi 1 phím Enter đơn (dùng để "bấm qua" các màn hình chào/hỏi lúc mới boot, vd "Do you trust
 * this directory?" của Codex — mặc định luôn chọn option đầu tiên/an toàn nhất). */
export async function sendEnter(name: string): Promise<void> {
  await tmux(['send-keys', '-t', name, 'Enter']);
}

/** Gửi phím mũi tên xuống — dialog "trust folder" của Claude Code mặc định highlight "No, exit"
 * (NGƯỢC với Codex, nơi Enter mù là đủ để chọn option an toàn) nên cần xuống 1 dòng chọn "Yes, I
 * trust this folder" trước khi Enter, không thì Claude Code tự thoát ngay lúc boot. */
export async function sendArrowDown(name: string): Promise<void> {
  await tmux(['send-keys', '-t', name, 'Down']);
}

export async function sendMessage(name: string, text: string): Promise<void> {
  await tmux(['send-keys', '-t', name, text]);
  // Gửi Enter thành lệnh RIÊNG — gộp chung với text trong 1 lần gọi send-keys không submit được
  // (đã tái hiện thật lúc verify tay), có lẽ do TUI coi input tới nhanh liên tiếp là 1 paste.
  await new Promise((resolve) => setTimeout(resolve, 150));
  await tmux(['send-keys', '-t', name, 'Enter']);
}

/** Chờ tới khi màn hình "đứng yên" (agent đã trả lời xong hoặc đang chờ input tiếp) rồi trả về
 * toàn bộ nội dung pane tại thời điểm đó. Không có event "done" rõ ràng như JSON — đây là cách
 * suy luận tốt nhất có thể với raw terminal capture. */
export async function waitForStableScreen(name: string): Promise<string> {
  const startedAt = Date.now();
  let previous: string | null = null;
  let stableCount = 0;

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const current = await capture(name);
    if (current === previous) {
      stableCount += 1;
      if (stableCount >= STABLE_POLLS_REQUIRED) return current;
    } else {
      stableCount = 0;
    }
    previous = current;
  }
  return previous ?? '';
}

/** Ký tự đánh dấu prompt user vừa gõ, xuất hiện lại y nguyên khi CLI echo — MỖI agent dùng 1
 * glyph unicode khác nhau trông gần giống hệt nhau bằng mắt: Codex dùng `›` (U+203A), Claude Code
 * dùng `❯` (U+276F) — đã tái hiện thật bằng cách chạy tay cả 2 agent trong tmux: hardcode chỉ 1
 * glyph khiến agent còn lại không match được marker nào, `afterPrompt` rơi về NGUYÊN CẢ MÀN HÌNH
 * (kể cả banner/version) thay vì đúng phần trả lời. */
const PROMPT_GLYPH_PATTERN = /[›❯]/;
/** Tương tự — dòng mở đầu câu trả lời: Codex dùng `•`, Claude Code dùng `⏺`. */
const REPLY_BULLET_PATTERN = /^[•⏺]\s*/;

const NOISE_LINE_PATTERN = /^[╭╮╰╯│─]/;

function cleanLines(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // Dòng box-drawing (╭─│╰) và status bar (chứa " · ") là khung UI, không phải nội dung.
    .filter((line) => !NOISE_LINE_PATTERN.test(line) && !line.includes(' · '));
}

/** Fallback cho agent KHÔNG dùng glyph prompt riêng — 1 shell thường (bash/zsh qua SSH, vd) không
 * có UI framework nào để bám vào, chỉ echo lại y nguyên phím gõ trên CHÍNH dòng prompt cũ (không
 * phải 1 dòng mới) rồi in output, rồi in lại prompt rỗng. Verify thật bằng bash: gõ "echo x && cat
 * f", màn hình SAU có 4 dòng `<prompt> echo x && cat f` / `x` / `<nội dung f>` / `<prompt>` — dòng
 * ĐẦU luôn là prompt+echo (bỏ), dòng CUỐI nếu trùng y hệt prompt lúc TRƯỚC khi gửi (đã rảnh trở
 * lại) cũng bỏ — còn lại giữa 2 dòng đó là output thật. So khớp theo DÒNG từ đầu (không phải cắt
 * chuỗi thô) vì phần scrollback phía trên có thể giống hệt nhau giữa trước/sau, chỉ phần cuối mới
 * đổi. Kém chính xác hơn cách dò theo glyph khi agent có UI phức tạp (progress bar dùng `\r` ghi
 * đè cùng 1 dòng sẽ không tách được), nhưng là cách duy nhất còn dùng được với agent không rõ UI. */
function extractByDiffingScreens(afterScreen: string, beforeScreen: string): string {
  const beforeLines = beforeScreen.split('\n');
  const afterLines = afterScreen.split('\n');

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < beforeLines.length &&
    commonPrefixLength < afterLines.length &&
    beforeLines[commonPrefixLength] === afterLines[commonPrefixLength]
  ) {
    commonPrefixLength++;
  }

  let newLines = afterLines.slice(commonPrefixLength);
  if (newLines.length > 0) newLines = newLines.slice(1); // dòng đầu = prompt cũ + echo phím gõ

  // So khớp/prompt-cuối phải làm SAU khi lọc dòng trắng — pane tmux có chiều cao cố định (vd 50
  // dòng) nên phần lớn dòng cuối mảng luôn là dòng TRẮNG đệm (chưa có gì ghi vào), không phải dòng
  // prompt thật — so trực tiếp phần tử cuối mảng thô sẽ luôn ra "" so với "" và cắt nhầm dòng
  // trắng thay vì dòng prompt (đã tái hiện thật lỗi này bằng cách chạy tay bash trong tmux).
  const cleaned = cleanLines(newLines);
  const originalPromptLine = cleanLines(beforeLines).at(-1);
  if (cleaned.length > 0 && originalPromptLine !== undefined && cleaned.at(-1) === originalPromptLine) {
    cleaned.pop(); // prompt rảnh xuất hiện lại ở cuối — agent đã nói xong
  }

  return cleaned.join(' ').trim();
}

/** Cắt phần trả lời MỚI ra khỏi toàn bộ scrollback. Có 2 cách tuỳ agent có glyph prompt riêng hay
 * không (`beforeScreen` = màn hình chụp NGAY TRƯỚC khi gửi tin, dùng cho fallback diff — xem
 * `extractByDiffingScreens`):
 * - Codex/Claude Code: tìm lần xuất hiện CUỐI của `<promptGlyph> <promptEcho>` (dòng CLI echo lại
 *   đúng text mình vừa gửi), lấy mọi thứ sau đó tới trước khi input placeholder rảnh xuất hiện
 *   lại, rồi bỏ tiền tố bullet của dòng đầu.
 * - Agent khác (vd shell thường qua SSH, không dùng glyph nào cả): diff màn hình trước/sau.
 * Cả 2 đường đều còn noise (tool log, box border) nếu agent có chạy tool giữa chừng; không cố phân
 * biệt "lời agent nói" với "log tool" vì raw text không có ranh giới rõ ràng cho việc đó (giới hạn
 * đã biết trước của cách tiếp cận tmux). */
export function extractLatestReply(screenText: string, promptEcho: string, beforeScreen?: string): string {
  const markerIndex = Math.max(
    screenText.lastIndexOf(`› ${promptEcho}`),
    screenText.lastIndexOf(`❯ ${promptEcho}`),
  );

  if (markerIndex === -1) {
    return beforeScreen !== undefined ? extractByDiffingScreens(screenText, beforeScreen) : screenText.trim();
  }

  // Độ dài marker luôn = 1 glyph + 1 space + promptEcho, bất kể agent nào khớp.
  const markerLength = 2 + promptEcho.length;
  const afterPrompt = screenText.slice(markerIndex + markerLength);
  const lines = cleanLines(afterPrompt.split('\n'));

  // Placeholder rảnh xuất hiện lại nghĩa là agent đã nói xong — cắt bỏ từ đó trở đi. Codex còn có
  // placeholder text "Use /skills..." riêng khi rảnh, Claude Code thì không nên chỉ dựa vào glyph.
  const idleIndex = lines.findIndex((line) => line.startsWith('Use /') || PROMPT_GLYPH_PATTERN.test(line[0] ?? ''));
  const replyLines = idleIndex === -1 ? lines : lines.slice(0, idleIndex);

  return replyLines
    .map((line) => line.replace(REPLY_BULLET_PATTERN, ''))
    .join(' ')
    .trim();
}

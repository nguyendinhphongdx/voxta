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
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'tmux',
      ['new-session', '-d', '-s', name, '-x', '220', '-y', '50', '-c', cwd, command],
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

async function capture(name: string): Promise<string> {
  return tmux(['capture-pane', '-t', name, '-p', '-S', '-2000']);
}

/** Gửi 1 phím Enter đơn (dùng để "bấm qua" các màn hình chào/hỏi lúc mới boot, vd "Do you trust
 * this directory?" của Codex — mặc định luôn chọn option đầu tiên/an toàn nhất). */
export async function sendEnter(name: string): Promise<void> {
  await tmux(['send-keys', '-t', name, 'Enter']);
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

/** Cắt phần trả lời MỚI ra khỏi toàn bộ scrollback: tìm lần xuất hiện CUỐI của `› <promptEcho>`
 * (dòng chương trình echo lại đúng text mình vừa gửi), lấy mọi thứ sau đó tới trước khi input
 * placeholder rảnh xuất hiện lại, rồi bỏ tiền tố "• " của dòng đầu (đánh dấu bắt đầu trả lời của
 * Codex) — phần còn lại là output thật, gồm cả noise (tool log, box border) nếu agent có chạy
 * tool giữa chừng; không cố phân biệt "lời agent nói" với "log tool" vì raw text không có ranh
 * giới rõ ràng cho việc đó (giới hạn đã biết trước của cách tiếp cận tmux). */
export function extractLatestReply(screenText: string, promptEcho: string): string {
  const marker = `› ${promptEcho}`;
  const markerIndex = screenText.lastIndexOf(marker);
  const afterPrompt = markerIndex === -1 ? screenText : screenText.slice(markerIndex + marker.length);

  const lines = afterPrompt
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // Dòng box-drawing (╭─│╰) và status bar (chứa " · ") là khung UI, không phải nội dung.
    .filter((line) => !/^[╭╮╰╯│─]/.test(line) && !line.includes(' · '));

  // Placeholder rảnh xuất hiện lại nghĩa là agent đã nói xong — cắt bỏ từ đó trở đi.
  const idleIndex = lines.findIndex((line) => line.startsWith('Use /') || line.startsWith('›'));
  const replyLines = idleIndex === -1 ? lines : lines.slice(0, idleIndex);

  return replyLines
    .map((line) => line.replace(/^•\s*/, ''))
    .join(' ')
    .trim();
}

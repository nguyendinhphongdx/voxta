import { existsSync, statSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';

import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable as NodeReadable } from 'node:stream';

import { NextResponse } from 'next/server';

import { readCurrentSettings } from '../../../../lib/settings-server';

const execFileAsync = promisify(execFile);

/** Chạy `claude` CLI headless như 1 subprocess và stream thẳng NDJSON stdout của nó về client —
 * ClaudeCodeConnector tự parse event schema thật (content_block_delta, session_id...), route này
 * không re-shape gì cả. `projectDir`/`claudeCodeBinaryPath` đọc từ Settings phía server (không
 * nhận từ client) — cùng lý do `/api/tts` đọc key phía server: client không tự ý đổi được thư
 * mục Claude Code chạy vào hay binary nào được gọi.
 *
 * CẢNH BÁO: `--dangerously-skip-permissions` bỏ qua MỌI xác nhận — Claude Code có thể sửa file,
 * chạy lệnh thật trong `projectDir` chỉ dựa trên văn bản STT nhận diện được từ giọng nói, không
 * có bước người dùng duyệt lại. Đây là lựa chọn tường minh của người dùng khi cấu hình backend
 * này trong Settings — không bật ngầm cho backend khác. */
export const runtime = 'nodejs';

interface ChatRequestBody {
  text?: string;
  sessionId?: string | null;
}

/** Cache trong process — chỉ cần dò lại login shell 1 lần cho tới khi server restart, không phải
 * mỗi request (spawn 1 shell interactive tốn ~vài trăm ms). */
let resolvedBinaryCache: string | null = null;

/** nvm (và tương tự) chỉ set PATH qua rc file của shell TƯƠNG TÁC (`.zshrc`/`.bashrc`) — 1 process
 * do GUI hay tool khác spawn ra (không qua shell login tương tác) sẽ không thấy PATH đó, dù
 * terminal của người dùng thấy `claude` bình thường (đã tái hiện thật lỗi này lúc dev). Thay vì
 * bắt người dùng tự `which claude` rồi dán tay, tự mở 1 login+interactive shell để hỏi lại PATH
 * thật — đúng cách nvm/asdf/... mong đợi được dùng. */
async function resolveClaudeViaLoginShell(): Promise<string | null> {
  if (resolvedBinaryCache) return resolvedBinaryCache;
  const shell = process.env.SHELL || '/bin/zsh';
  try {
    const { stdout } = await execFileAsync(shell, ['-lic', 'command -v claude'], { timeout: 5000 });
    const resolved = stdout.trim().split('\n').pop()?.trim();
    if (resolved) resolvedBinaryCache = resolved;
    return resolvedBinaryCache;
  } catch {
    return null; // shell tương tác cũng không thấy — thật sự chưa cài, không phải vấn đề PATH
  }
}

interface SpawnResult {
  child: ChildProcessByStdio<null, NodeReadable, NodeReadable>;
  error: NodeJS.ErrnoException | null;
}

function trySpawn(cmd: string, args: string[], cwd: string): Promise<SpawnResult> {
  const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve) => {
    child.once('error', (err: NodeJS.ErrnoException) => resolve({ child, error: err }));
    child.once('spawn', () => resolve({ child, error: null }));
  });
}

/** spawn `claude`; nếu ENOENT và người dùng chưa tự cấu hình đường dẫn riêng (vẫn để mặc định
 * "claude"), tự thử dò lại qua login shell rồi spawn lại đúng 1 lần trước khi báo lỗi. */
async function spawnClaude(binaryPath: string, args: string[], cwd: string): Promise<SpawnResult> {
  const first = await trySpawn(
    resolvedBinaryCache && binaryPath === 'claude' ? resolvedBinaryCache : binaryPath,
    args,
    cwd,
  );
  if (!first.error || first.error.code !== 'ENOENT' || binaryPath !== 'claude') return first;

  const resolved = await resolveClaudeViaLoginShell();
  if (!resolved) return first;
  return trySpawn(resolved, args, cwd);
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequestBody;
  const text = (body.text ?? '').trim();
  const sessionId = (body.sessionId ?? '').trim() || null;
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const settings = readCurrentSettings();
  const projectDir = settings.claudeCodeProjectDir.trim();
  const binaryPath = settings.claudeCodeBinaryPath.trim() || 'claude';

  if (!projectDir) {
    return NextResponse.json({ error: 'Thiếu Project Directory trong Settings' }, { status: 400 });
  }
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
    return NextResponse.json(
      { error: `Project Directory không tồn tại: ${projectDir}` },
      { status: 400 },
    );
  }

  const args = [
    '-p',
    text,
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--dangerously-skip-permissions',
  ];
  if (sessionId) args.push('--resume', sessionId);

  const { child, error: spawnError } = await spawnClaude(binaryPath, args, projectDir);

  if (spawnError) {
    const message =
      spawnError.code === 'ENOENT'
        ? `Không tìm thấy "${binaryPath}" trên máy đang chạy server voxta, kể cả sau khi tự dò ` +
          'qua login shell. Cần cài Claude Code (https://claude.com/claude-code); nếu đã cài, ' +
          'điền đường dẫn tuyệt đối (`which claude` trong terminal) vào "Đường dẫn claude CLI" ' +
          'trong Settings.'
        : `Không khởi động được Claude Code CLI: ${spawnError.message}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new Response(Readable.toWeb(child.stdout) as ReadableStream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

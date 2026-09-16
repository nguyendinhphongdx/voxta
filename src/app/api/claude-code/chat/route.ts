import { existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

import { NextResponse } from 'next/server';

/** Chạy `claude` CLI headless như 1 subprocess và stream thẳng NDJSON stdout của nó về client —
 * ClaudeCodeConnector tự parse event schema thật (content_block_delta, session_id...), route này
 * không re-shape gì cả.
 *
 * CẢNH BÁO: `--dangerously-skip-permissions` bỏ qua MỌI xác nhận — Claude Code có thể sửa file,
 * chạy lệnh thật trong `projectDir` chỉ dựa trên văn bản STT nhận diện được từ giọng nói, không
 * có bước người dùng duyệt lại. Đây là lựa chọn tường minh của người dùng khi cấu hình backend
 * này trong Settings — không bật ngầm cho backend khác. */
export const runtime = 'nodejs';

interface ChatRequestBody {
  text?: string;
  sessionId?: string | null;
  projectDir?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequestBody;
  const text = (body.text ?? '').trim();
  const projectDir = (body.projectDir ?? '').trim();
  const sessionId = (body.sessionId ?? '').trim() || null;

  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
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

  const child = spawn('claude', args, { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] });

  return new Response(Readable.toWeb(child.stdout) as ReadableStream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

import { existsSync, openSync, readdirSync, readSync, statSync, closeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { readCurrentSettings } from '../../../../lib/settings-server';

export const runtime = 'nodejs';

/** Chỉ đọc PHẦN ĐẦU file — transcript có thể dài nhiều MB (đã thấy thật file 16MB+), tin nhắn mở
 * đầu luôn nằm trong vài dòng đầu tiên nên không cần đọc hết. */
const PREVIEW_BYTES = 8192;
const PREVIEW_MAX_LENGTH = 140;

interface SessionInfo {
  sessionId: string;
  preview: string;
  updatedAt: number;
}

/** Claude Code map `cwd` -> thư mục lưu session bằng cách thay MỌI `/` thành `-` (đã verify thật
 * bằng cách đọc `~/.claude/projects/` — vd `/Users/x/y` -> `-Users-x-y`). */
function projectDirToSlug(projectDir: string): string {
  return projectDir.replace(/\//g, '-');
}

/** `message.content` của dòng đầu có thể là string thẳng HOẶC mảng content block `{type:'text',
 * text:'...'}` — đã thấy CẢ 2 dạng thật trong file transcript thật, tuỳ session tạo qua đường nào
 * (SDK gửi thẳng string, CLI tương tác gói thành mảng block). */
function extractPreviewText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const block = content.find(
      (item): item is { type: string; text: string } =>
        typeof item === 'object' && item !== null && (item as { type?: unknown }).type === 'text',
    );
    return block?.text ?? null;
  }
  return null;
}

function readFirstUserMessagePreview(filePath: string): string | null {
  const fd = openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(PREVIEW_BYTES);
    const bytesRead = readSync(fd, buffer, 0, PREVIEW_BYTES, 0);
    const text = buffer.toString('utf8', 0, bytesRead);
    const lines = text.split('\n');
    // Dòng cuối trong prefix có thể bị cắt giữa chừng (đọc đúng PREVIEW_BYTES, không theo ranh
    // giới dòng) — bỏ qua, không cố parse dòng dở dang.
    for (const line of lines.slice(0, -1)) {
      if (!line.trim()) continue;
      let obj: { type?: string; message?: { role?: string; content?: unknown } };
      try {
        obj = JSON.parse(line) as typeof obj;
      } catch {
        continue;
      }
      if (obj.type === 'user' && obj.message?.role === 'user') {
        const preview = extractPreviewText(obj.message.content);
        if (preview) return preview.trim().slice(0, PREVIEW_MAX_LENGTH);
      }
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

export async function GET() {
  const settings = readCurrentSettings();
  const projectDir = settings.claudeCodeProjectDir.trim();
  if (!projectDir) return NextResponse.json({ sessions: [] });

  const sessionsDir = path.join(os.homedir(), '.claude', 'projects', projectDirToSlug(projectDir));
  if (!existsSync(sessionsDir)) return NextResponse.json({ sessions: [] });

  const sessions: SessionInfo[] = [];
  for (const entry of readdirSync(sessionsDir)) {
    if (!entry.endsWith('.jsonl')) continue;
    const filePath = path.join(sessionsDir, entry);
    const sessionId = entry.slice(0, -'.jsonl'.length);
    try {
      const stat = statSync(filePath);
      const preview = readFirstUserMessagePreview(filePath);
      sessions.push({ sessionId, preview: preview ?? '(không đọc được tin nhắn mở đầu)', updatedAt: stat.mtimeMs });
    } catch {
      // File lỗi/không đọc được (hiếm — quyền, hỏng...) — bỏ qua session đó, không chặn cả danh
      // sách vì 1 file lỗi.
    }
  }

  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  return NextResponse.json({ sessions });
}

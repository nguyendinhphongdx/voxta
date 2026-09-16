import { existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readCurrentSettings } from '../../../../lib/settings-server';
import { sendEnter, startSession } from '../../../../lib/tmux-agent';

export const runtime = 'nodejs';

/** Boot 1 CLI agent tương tác thường hiện vài màn hình chào/xác nhận trước khi vào trạng thái
 * rảnh thật sự (vd Codex hỏi "Do you trust this directory?") — thử bấm Enter (chọn option mặc
 * định) vài lần trong lúc boot, dừng sớm nếu không còn gì đổi. Không có cách phân biệt "đang hỏi
 * xác nhận" với "agent đang trả lời" một cách chắc chắn bằng raw text, nên chấp nhận đây là suy
 * đoán tốt nhất — khớp tinh thần --dangerously-skip-permissions người dùng đã chọn cho backend
 * Claude Code headless. */
async function dismissStartupPrompts(sessionName: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await sendEnter(sessionName);
  }
}

export async function POST() {
  const settings = readCurrentSettings();
  const command = settings.tmuxAgentCommand.trim() || 'codex';
  const projectDir = settings.tmuxAgentProjectDir.trim();

  if (!projectDir) {
    return NextResponse.json({ error: 'Thiếu Project Directory trong Settings' }, { status: 400 });
  }
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
    return NextResponse.json(
      { error: `Project Directory không tồn tại: ${projectDir}` },
      { status: 400 },
    );
  }

  const sessionName = `voxta-${randomUUID()}`;
  try {
    await startSession(sessionName, command, projectDir);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Không khởi động được "${command}" trong tmux: ${err.message}`
            : 'Không khởi động được agent trong tmux.',
      },
      { status: 500 },
    );
  }

  await dismissStartupPrompts(sessionName);
  return NextResponse.json({ sessionName });
}

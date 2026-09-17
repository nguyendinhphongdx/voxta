import { existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readCurrentSettings } from '../../../../lib/settings-server';
import { capture, sendArrowDown, sendEnter, startSession } from '../../../../lib/tmux-agent';

export const runtime = 'nodejs';

/** Claude Code hỏi "Is this a project you created or one you trust?" lúc boot lần đầu trong 1 thư
 * mục — KHÁC Codex ở chỗ option mặc định được highlight là "No, exit" (Enter mù sẽ THOÁT HẲN
 * Claude Code thay vì chọn tiếp) — đã tái hiện thật bằng cách chạy tay. Phải dò đúng chuỗi này để
 * biết cần bấm thêm phím xuống trước khi Enter. */
const CLAUDE_TRUST_DIALOG_MARKER = 'Is this a project you created or one you trust?';

/** Boot 1 CLI agent tương tác thường hiện vài màn hình chào/xác nhận trước khi vào trạng thái
 * rảnh thật sự (vd Codex hỏi "Do you trust this directory?", chọn được ngay bằng Enter vì option
 * mặc định là đồng ý). Với agent không rõ trước (generic), Enter mù vẫn là suy đoán tốt nhất —
 * chỉ đặc cách cho Claude Code (agent phổ biến, hành vi ngược lại đã biết rõ) để không bấm nhầm
 * "No, exit". Không có cách phân biệt chắc chắn 100% "đang hỏi xác nhận" với "agent đang trả lời"
 * bằng raw text cho MỌI agent tuỳ ý, nên đây vẫn là best-effort, khớp tinh thần
 * --dangerously-skip-permissions người dùng đã chọn cho backend Claude Code headless. */
async function dismissStartupPrompts(sessionName: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const screen = await capture(sessionName);
    if (screen.includes(CLAUDE_TRUST_DIALOG_MARKER)) {
      await sendArrowDown(sessionName);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
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

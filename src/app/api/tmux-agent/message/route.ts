import { NextResponse } from 'next/server';

import { extractLatestReply, sendMessage, sessionExists, waitForStableScreen } from '../../../../lib/tmux-agent';

export const runtime = 'nodejs';

interface MessageRequestBody {
  sessionName?: string;
  text?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as MessageRequestBody;
  const sessionName = (body.sessionName ?? '').trim();
  const text = (body.text ?? '').trim();

  if (!sessionName) return NextResponse.json({ error: 'sessionName required' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  if (!(await sessionExists(sessionName))) {
    return NextResponse.json(
      { error: 'Session tmux đã kết thúc (agent tự thoát hoặc bị đóng) — bắt đầu lại cuộc gọi.' },
      { status: 410 },
    );
  }

  await sendMessage(sessionName, text);
  // KHÔNG streaming theo token thật được (xem lib/tmux-agent.ts) — chờ cả lượt xong rồi trả 1
  // cục, bridge dùng chung vẫn tự cắt câu/đọc tuần tự như bình thường từ đó.
  const screen = await waitForStableScreen(sessionName);
  const reply = extractLatestReply(screen, text);

  return NextResponse.json({ reply });
}

import { NextResponse } from 'next/server';

import { killSession } from '../../../../lib/tmux-agent';

export const runtime = 'nodejs';

interface StopRequestBody {
  sessionName?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as StopRequestBody;
  const sessionName = (body.sessionName ?? '').trim();
  if (sessionName) await killSession(sessionName);
  return NextResponse.json({ ok: true });
}

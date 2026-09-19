import { NextResponse } from 'next/server';

import { listConversations, upsertConversation } from '../../../lib/db';

// better-sqlite3 là native module — cần Node runtime, không chạy được trên Edge.
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(listConversations());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { id: string; title: string; messages: unknown };
  upsertConversation({ id: body.id, title: body.title, messages: JSON.stringify(body.messages) });
  return NextResponse.json({ ok: true });
}

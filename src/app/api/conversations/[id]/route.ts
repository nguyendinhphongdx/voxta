import { NextResponse } from 'next/server';

import { deleteConversation, readConversation } from '../../../../lib/db';

// better-sqlite3 là native module — cần Node runtime, không chạy được trên Edge.
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = readConversation(id);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ id: row.id, title: row.title, messages: JSON.parse(row.messages) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteConversation(id);
  return NextResponse.json({ ok: true });
}

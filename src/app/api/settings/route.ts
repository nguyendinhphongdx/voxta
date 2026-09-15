import { NextResponse } from 'next/server';

import { writeSettingsJson } from '../../../lib/db';
import { readCurrentSettings } from '../../../lib/settings-server';
import type { VoxtaSettings } from '../../../lib/settings';

// better-sqlite3 là native module — cần Node runtime, không chạy được trên Edge.
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(readCurrentSettings());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as VoxtaSettings;
  writeSettingsJson(JSON.stringify(body));
  return NextResponse.json({ ok: true });
}

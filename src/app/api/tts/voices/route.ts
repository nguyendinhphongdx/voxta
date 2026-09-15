import { NextResponse } from 'next/server';

import { readCurrentSettings } from '../../../../lib/settings-server';

/** Danh sách giọng Google theo ngôn ngữ — OpenAI không có endpoint tương đương (danh sách giọng
 * cố định, chọn ở client). Chạy server-side để dùng chung key đã lưu, không cần Settings gửi lại
 * key qua query string. */
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const settings = readCurrentSettings();
  if (!settings.googleApiKey) {
    return NextResponse.json({ error: 'Thiếu Google API key trong Settings' }, { status: 400 });
  }
  const languageCode = new URL(request.url).searchParams.get('languageCode') || 'vi-VN';
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/voices?key=${settings.googleApiKey}&languageCode=${encodeURIComponent(languageCode)}`,
  );
  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: `Google TTS lỗi (HTTP ${res.status}): ${detail.slice(0, 300)}` },
      { status: 502 },
    );
  }
  const data = (await res.json()) as { voices?: Array<{ name: string; ssmlGender?: string }> };
  return NextResponse.json({ voices: data.voices ?? [] });
}

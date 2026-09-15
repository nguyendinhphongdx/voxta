import { NextResponse } from 'next/server';

import { readCurrentSettings } from '../../../lib/settings-server';
import type { VoxtaSettings } from '../../../lib/settings';

/** Proxy TTS thật (OpenAI/Google) — chạy trên server để API key không bao giờ lộ ra network tab
 * của trình duyệt. Đọc key/voice từ SQLite (đã lưu qua `/api/settings`) thay vì nhận từ client. */
export const runtime = 'nodejs';

async function synthesizeOpenAi(text: string, settings: VoxtaSettings): Promise<Response> {
  if (!settings.openaiApiKey) {
    return NextResponse.json({ error: 'Thiếu OpenAI API key trong Settings' }, { status: 400 });
  }
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.openaiTtsModel || 'gpt-4o-mini-tts',
      voice: settings.openaiTtsVoice || 'alloy',
      input: text,
      response_format: 'mp3',
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: `OpenAI TTS lỗi (HTTP ${res.status}): ${detail.slice(0, 300)}` },
      { status: 502 },
    );
  }
  return new NextResponse(await res.arrayBuffer(), { headers: { 'Content-Type': 'audio/mpeg' } });
}

async function synthesizeGoogle(text: string, settings: VoxtaSettings): Promise<Response> {
  if (!settings.googleApiKey) {
    return NextResponse.json({ error: 'Thiếu Google API key trong Settings' }, { status: 400 });
  }
  const voiceName = settings.googleTtsVoice || 'vi-VN-Wavenet-A';
  const languageCode = voiceName.split('-').slice(0, 2).join('-') || 'vi-VN';
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${settings.googleApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: `Google TTS lỗi (HTTP ${res.status}): ${detail.slice(0, 300)}` },
      { status: 502 },
    );
  }
  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) {
    return NextResponse.json({ error: 'Google TTS không trả về audio' }, { status: 502 });
  }
  return new NextResponse(Buffer.from(data.audioContent, 'base64'), {
    headers: { 'Content-Type': 'audio/mpeg' },
  });
}

export async function POST(request: Request) {
  const { text } = (await request.json()) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const settings = readCurrentSettings();
  if (settings.ttsProvider === 'openai') return synthesizeOpenAi(text, settings);
  if (settings.ttsProvider === 'google') return synthesizeGoogle(text, settings);
  return NextResponse.json({ error: 'ttsProvider phải là openai hoặc google' }, { status: 400 });
}

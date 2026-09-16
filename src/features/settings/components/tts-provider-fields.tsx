'use client';

import { useState } from 'react';

import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import type { VoxtaSettings } from '../../../lib/settings';
import { useGoogleVoices } from '../hooks/use-google-voices';
import { SettingsField } from './settings-field';

const TTS_PROVIDER_LABEL: Record<VoxtaSettings['ttsProvider'], string> = {
  browser: 'Trình duyệt (miễn phí, chất lượng thấp)',
  openai: 'OpenAI TTS',
  google: 'Google Cloud TTS',
};

const OPENAI_TTS_MODELS = ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'];
// Danh sách giọng OpenAI cố định — không có endpoint "list voices" như Google nên phải liệt kê
// tay theo docs (https://platform.openai.com/docs/guides/text-to-speech).
const OPENAI_TTS_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

/** languageCode suy từ tên giọng Google dạng "vi-VN-Wavenet-A" (2 segment đầu), else "vi-VN". */
function languageCodeFromVoiceName(voiceName: string): string {
  const parts = voiceName.split('-');
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'vi-VN';
}

interface TtsProviderFieldsProps {
  value: VoxtaSettings;
  onChange: (patch: Partial<VoxtaSettings>) => void;
}

/** Giọng đọc trả lời — dùng chung cho mọi backend chỉ có text (Hermes, Claude Code, Terminal
 * Agent). Tự chứa toàn bộ state riêng của UI chọn giọng Google (`googleLanguageCode` chỉ là bộ
 * lọc để tải danh sách, không phải field lưu trong settings) nên không phụ thuộc backend nào. */
export function TtsProviderFields({ value, onChange }: TtsProviderFieldsProps) {
  const [googleLanguageCode, setGoogleLanguageCode] = useState(languageCodeFromVoiceName(value.googleTtsVoice));

  const googleVoices = useGoogleVoices({
    enabled: value.ttsProvider === 'google',
    apiKey: value.googleApiKey,
    languageCode: googleLanguageCode,
  });

  return (
    <div className="flex flex-col gap-5">
      <SettingsField label="Giọng đọc trả lời">
        <Select value={value.ttsProvider} onValueChange={(v) => onChange({ ttsProvider: v as VoxtaSettings['ttsProvider'] })}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v: VoxtaSettings['ttsProvider']) => TTS_PROVIDER_LABEL[v]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="browser">Trình duyệt (miễn phí, chất lượng thấp)</SelectItem>
            <SelectItem value="openai">OpenAI TTS</SelectItem>
            <SelectItem value="google">Google Cloud TTS</SelectItem>
          </SelectContent>
        </Select>
      </SettingsField>

      {value.ttsProvider === 'openai' && (
        <>
          <SettingsField label="OpenAI API Key">
            <Input
              value={value.openaiApiKey}
              onChange={(e) => onChange({ openaiApiKey: e.target.value })}
              placeholder="sk-..."
              type="password"
            />
          </SettingsField>
          <SettingsField label="Model">
            <Select value={value.openaiTtsModel} onValueChange={(v) => onChange({ openaiTtsModel: v ?? '' })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_TTS_MODELS.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>
          <SettingsField label="Giọng">
            <Select value={value.openaiTtsVoice} onValueChange={(v) => onChange({ openaiTtsVoice: v ?? '' })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_TTS_VOICES.map((voice) => (
                  <SelectItem key={voice} value={voice}>
                    {voice}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>
        </>
      )}

      {value.ttsProvider === 'google' && (
        <>
          <SettingsField label="Google API Key">
            <Input
              value={value.googleApiKey}
              onChange={(e) => onChange({ googleApiKey: e.target.value })}
              placeholder="AIza..."
              type="password"
            />
          </SettingsField>
          <SettingsField label="Ngôn ngữ giọng">
            <Input value={googleLanguageCode} onChange={(e) => setGoogleLanguageCode(e.target.value)} placeholder="vd: vi-VN" />
          </SettingsField>
          <SettingsField label="Giọng">
            {googleVoices.loading ? (
              <p className="text-sm text-muted-foreground">Đang tải danh sách giọng...</p>
            ) : googleVoices.error ? (
              <>
                <p className="text-sm text-destructive">{googleVoices.error}</p>
                <Input
                  value={value.googleTtsVoice}
                  onChange={(e) => onChange({ googleTtsVoice: e.target.value })}
                  placeholder="vd: vi-VN-Wavenet-A"
                />
              </>
            ) : googleVoices.voices && googleVoices.voices.length > 0 ? (
              <Select value={value.googleTtsVoice} onValueChange={(v) => onChange({ googleTtsVoice: v ?? '' })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {googleVoices.voices.map((voice) => (
                    <SelectItem key={voice.name} value={voice.name}>
                      {voice.name}
                      {voice.ssmlGender ? ` (${voice.ssmlGender})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={value.googleTtsVoice}
                onChange={(e) => onChange({ googleTtsVoice: e.target.value })}
                placeholder="Nhập API Key để tải danh sách, hoặc gõ tay vd: vi-VN-Wavenet-A"
              />
            )}
          </SettingsField>
        </>
      )}
    </div>
  );
}

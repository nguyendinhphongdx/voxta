import { useEffect, useState } from 'react';

export interface GoogleVoice {
  name: string;
  ssmlGender?: string;
}

interface UseGoogleVoicesArgs {
  /** Chỉ fetch khi true — tránh gọi API thừa lúc đang xem provider khác. */
  enabled: boolean;
  apiKey: string;
  languageCode: string;
}

interface UseGoogleVoicesResult {
  voices: GoogleVoice[] | null;
  error: string | null;
  loading: boolean;
}

/** Danh sách giọng Google TTS theo ngôn ngữ, tải lại mỗi khi key/ngôn ngữ đổi — tách khỏi
 * SettingsView để component chỉ lo render, không lo network. */
export function useGoogleVoices({ enabled, apiKey, languageCode }: UseGoogleVoicesArgs): UseGoogleVoicesResult {
  const [voices, setVoices] = useState<GoogleVoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !apiKey.trim()) {
      setVoices(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/tts/voices?languageCode=${encodeURIComponent(languageCode)}`)
      .then(async (res) => {
        const body = (await res.json()) as { voices?: GoogleVoice[]; error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setVoices(body.voices ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setVoices(null);
        setError(err instanceof Error ? err.message : 'Không tải được danh sách giọng.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, apiKey, languageCode]);

  return { voices, error, loading };
}

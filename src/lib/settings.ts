/** Settings lưu localStorage — voxta 1 người dùng, không có account/multi-tenant (giống Ultron). */

export interface VoxtaSettings {
  backend: 'ultron'; // Phase 1 chỉ có 1 backend — union mở rộng khi thêm Hermes (Phase 2)
  apiBaseUrl: string;
  agentId: number | null;
}

const STORAGE_KEY = 'voxta.settings.v1';

const DEFAULT_SETTINGS: VoxtaSettings = {
  backend: 'ultron',
  apiBaseUrl: 'http://localhost:8000',
  agentId: null,
};

export function loadSettings(): VoxtaSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<VoxtaSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: VoxtaSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

import { readSettingsJson } from './db';
import { DEFAULT_SETTINGS } from './settings';
import type { VoxtaSettings } from './settings';

/** Đọc settings hiện tại từ SQLite (server-only, dùng trong API routes) — tách riêng khỏi
 * `settings.ts` vì file đó còn được import từ client code, không được kéo theo `db.ts`
 * (better-sqlite3 là native module, chỉ chạy được trên server). */
export function readCurrentSettings(): VoxtaSettings {
  const raw = readSettingsJson();
  return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<VoxtaSettings>) } : DEFAULT_SETTINGS;
}

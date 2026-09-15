import { create } from 'zustand';

import { DEFAULT_SETTINGS, fetchSettings, saveSettings } from '../../lib/settings';
import type { VoxtaSettings } from '../../lib/settings';

interface SettingsStore {
  settings: VoxtaSettings;
  /** false cho tới khi `load()` xong lần đầu — CallView/SettingsView chờ giá trị này trước khi
   * render để không thoáng hiện cấu hình mặc định rồi nhảy sang cấu hình thật. */
  loaded: boolean;
  load: () => Promise<void>;
  save: (next: VoxtaSettings) => Promise<void>;
}

/** Store settings dùng chung toàn app — cả CallView (để tạo connector) lẫn SettingsView (để
 * sửa) đọc/ghi qua đây, không cần truyền props settings/onSave qua nhiều tầng component nữa.
 * Nguồn sự thật vẫn là SQLite phía server (`lib/settings.ts` gọi `/api/settings`); store chỉ
 * cache lại trong phiên làm việc của tab hiện tại. */
export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const settings = await fetchSettings();
    set({ settings, loaded: true });
  },

  save: async (next) => {
    set({ settings: next });
    await saveSettings(next);
  },
}));

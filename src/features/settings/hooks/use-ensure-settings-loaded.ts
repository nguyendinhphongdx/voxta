import { useEffect } from 'react';

import { useSettingsStore } from '../store';

/** Đảm bảo settings đã load từ SQLite trước khi render — dùng ở cả 2 route (`/` và `/settings`)
 * vì cả CallView (tạo connector) lẫn SettingsView (sửa) đều cần `useSettingsStore` sẵn sàng. */
export function useEnsureSettingsLoaded(): boolean {
  const loaded = useSettingsStore((s) => s.loaded);
  const load = useSettingsStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return loaded;
}

import { useEffect } from 'react';

import { useCallStore } from '../store';

/** Cuộc gọi phải dừng khi rời màn hình (vd bấm vào Settings) — nếu không mic/TTS cứ chạy nền. */
export function useCallLifecycle(): void {
  useEffect(() => useCallStore.getState().stop, []);
}

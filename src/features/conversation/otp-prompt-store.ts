import { create } from 'zustand';

interface PendingOtp {
  machineId: string;
  resolve: (code: string) => void;
  reject: (err: Error) => void;
}

interface OtpPromptStore {
  pending: PendingOtp | null;
  /** Gọi từ connector lúc login trả về `requireOtp` — trả về Promise CHỜ tới khi người dùng gõ mã
   * qua `OtpPromptDialog` (hoặc huỷ). Không lưu OTP/TOTP secret ở đâu cả — mỗi lần chỉ hỏi đúng 1
   * mã dùng ngay, y hệt cách 2FA hoạt động ở mọi nơi khác. */
  requestOtp: (machineId: string) => Promise<string>;
  submit: (code: string) => void;
  cancel: () => void;
}

export const useOtpPromptStore = create<OtpPromptStore>((set, get) => ({
  pending: null,

  requestOtp: (machineId) =>
    new Promise<string>((resolve, reject) => {
      set({ pending: { machineId, resolve, reject } });
    }),

  submit: (code) => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    pending.resolve(code);
  },

  cancel: () => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    pending.reject(new Error('Đã huỷ nhập OTP.'));
  },
}));

'use client';

import { useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useOtpPromptStore } from '../otp-prompt-store';

/** Modal toàn cục — render 1 lần ở layout gốc, chỉ hiện khi `RemoteTerminalConnector` cần mã OTP
 * (đăng nhập relay bật 2FA). Đứng ngoài mọi route (`/`, `/live`) vì cả 2 đều có thể kích hoạt lúc
 * bắt đầu phiên với backend "remote-terminal". */
export function OtpPromptDialog() {
  const pending = useOtpPromptStore((s) => s.pending);
  const submit = useOtpPromptStore((s) => s.submit);
  const cancel = useOtpPromptStore((s) => s.cancel);
  const [code, setCode] = useState('');

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-xs rounded-xl border bg-card p-5 text-card-foreground shadow-lg">
        <h2 className="mb-1 text-sm font-semibold">Nhập mã OTP</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Máy {pending.machineId} bật xác thực 2 lớp — mở app xác thực (Google Authenticator, Authy...) và nhập mã
          6 số hiện tại.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) submit(code.trim());
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            inputMode="numeric"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCode('');
                cancel();
              }}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={!code.trim()}>
              Xác nhận
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

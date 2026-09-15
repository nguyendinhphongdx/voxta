import type { ReactNode } from 'react';

import { Label } from '../../../components/ui/label';

interface SettingsFieldProps {
  label: string;
  children: ReactNode;
}

/** Wrapper label+control dùng lại cho mọi field trong SettingsView — thêm field mới chỉ cần bọc
 * control trong component này, không phải lặp lại markup label mỗi lần. */
export function SettingsField({ label, children }: SettingsFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

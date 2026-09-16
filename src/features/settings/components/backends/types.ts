import type { VoxtaSettings } from '../../../../lib/settings';

/** Props chung mọi field-group theo backend nhận — `value` là toàn bộ form (không chỉ phần của
 * backend đó) để field group nào cũng đọc được field dùng chung nếu cần, `onChange` merge patch
 * vào form thay vì thay cả object. */
export interface BackendFieldsProps {
  value: VoxtaSettings;
  onChange: (patch: Partial<VoxtaSettings>) => void;
}

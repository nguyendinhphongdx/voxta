import type { ComponentType } from 'react';

import type { VoxtaSettings } from '../../../../lib/settings';
import { ClaudeCodeFields } from './claude-code-fields';
import { HermesFields } from './hermes-fields';
import { RemoteTerminalFields } from './remote-terminal-fields';
import { TmuxAgentFields } from './tmux-agent-fields';
import { UltronFields } from './ultron-fields';
import type { BackendFieldsProps } from './types';

export type { BackendFieldsProps } from './types';

/** Map backend -> component field-group riêng — đây là điểm DUY NHẤT cần sửa khi thêm backend
 * mới: viết 1 file field-group trong thư mục này rồi thêm 1 dòng vào map, không phải đụng vào
 * SettingsView hay điều kiện if/else nào khác. */
export const BACKEND_FIELDS: Record<VoxtaSettings['backend'], ComponentType<BackendFieldsProps>> = {
  ultron: UltronFields,
  hermes: HermesFields,
  'claude-code': ClaudeCodeFields,
  'tmux-agent': TmuxAgentFields,
  'remote-terminal': RemoteTerminalFields,
};

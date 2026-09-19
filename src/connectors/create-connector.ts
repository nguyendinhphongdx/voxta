import { ClaudeCodeConnector } from './claude-code/ClaudeCodeConnector';
import { HermesConnector } from './hermes/HermesConnector';
import { RemoteTerminalConnector } from './remote-terminal/RemoteTerminalConnector';
import { TmuxAgentConnector } from './tmux-agent/TmuxAgentConnector';
import { UltronConnector } from './ultron/UltronConnector';
import type { VoiceBackendConnector } from './types';
import type { VoxtaSettings } from '../lib/settings';

/** Ánh xạ `settings.backend` -> connector cụ thể. Thêm backend mới chỉ cần thêm 1 case ở đây —
 * không phải sửa CallView hay bất kỳ nơi nào đang dùng connector. */
export function createConnector(settings: VoxtaSettings): VoiceBackendConnector {
  if (settings.backend === 'hermes') {
    return new HermesConnector({
      gatewayUrl: settings.hermesGatewayUrl,
      apiKey: settings.hermesApiKey,
      model: settings.hermesModel,
      language: 'vi-VN',
      ttsProvider: settings.ttsProvider,
    });
  }
  if (settings.backend === 'claude-code') {
    return new ClaudeCodeConnector({
      language: 'vi-VN',
      ttsProvider: settings.ttsProvider,
      initialSessionId: settings.claudeCodeSessionId,
    });
  }
  if (settings.backend === 'tmux-agent') {
    return new TmuxAgentConnector({ language: 'vi-VN', ttsProvider: settings.ttsProvider });
  }
  if (settings.backend === 'remote-terminal') {
    return new RemoteTerminalConnector({
      relayUrl: settings.remoteTerminalRelayUrl,
      machineId: settings.remoteTerminalMachineId,
      password: settings.remoteTerminalPassword,
      language: 'vi-VN',
      ttsProvider: settings.ttsProvider,
    });
  }
  return new UltronConnector({ apiBaseUrl: settings.apiBaseUrl, agentId: settings.agentId });
}

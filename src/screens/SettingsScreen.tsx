import { useState } from 'react';

import type { VoxtaSettings } from '../lib/settings';

interface SettingsScreenProps {
  settings: VoxtaSettings;
  onSave: (settings: VoxtaSettings) => void;
  onClose: () => void;
}

/** Tách hẳn khỏi màn gọi chính — cấu hình backend không phải bề mặt chính end-user thấy hằng
 * ngày (Phase 1 chỉ có backend "ultron", dropdown chọn backend để trống chỗ cho Phase 2/Hermes). */
export function SettingsScreen({ settings, onSave, onClose }: SettingsScreenProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl);
  const [agentId, setAgentId] = useState(settings.agentId?.toString() ?? '');

  const handleSave = () => {
    onSave({
      backend: 'ultron',
      apiBaseUrl: apiBaseUrl.trim().replace(/\/$/, ''),
      agentId: agentId.trim() ? Number(agentId) : null,
    });
    onClose();
  };

  return (
    <div className="settings-screen">
      <h1>Cài đặt</h1>

      <label className="field">
        <span>Backend</span>
        <select value="ultron" disabled>
          <option value="ultron">Ultron</option>
        </select>
      </label>

      <label className="field">
        <span>Ultron API URL</span>
        <input
          value={apiBaseUrl}
          onChange={(event) => setApiBaseUrl(event.target.value)}
          placeholder="http://localhost:8000"
        />
      </label>

      <label className="field">
        <span>Agent ID (để trống = agent mặc định)</span>
        <input
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
          placeholder="vd: 3"
          inputMode="numeric"
        />
      </label>

      <div className="settings-actions">
        <button type="button" onClick={onClose}>
          Huỷ
        </button>
        <button type="button" onClick={handleSave} className="primary">
          Lưu
        </button>
      </div>
    </div>
  );
}

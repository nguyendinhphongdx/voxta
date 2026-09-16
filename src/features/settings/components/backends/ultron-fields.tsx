'use client';

import { useState } from 'react';

import { Input } from '../../../../components/ui/input';
import { SettingsField } from '../settings-field';
import type { BackendFieldsProps } from './types';

export function UltronFields({ value, onChange }: BackendFieldsProps) {
  // agentId là number|null trong settings nhưng cần giữ text thô lúc gõ (vd đang gõ dở "-" hay
  // xoá trắng) — buffer riêng, chỉ đồng bộ từ `value` lúc mount, giống cách SettingsView cũ làm.
  const [agentIdText, setAgentIdText] = useState(value.agentId?.toString() ?? '');

  return (
    <>
      <SettingsField label="Ultron API URL">
        <Input
          value={value.apiBaseUrl}
          onChange={(e) => onChange({ apiBaseUrl: e.target.value })}
          placeholder="http://localhost:8000"
        />
      </SettingsField>

      <SettingsField label="Agent ID (để trống = agent mặc định)">
        <Input
          value={agentIdText}
          onChange={(e) => {
            setAgentIdText(e.target.value);
            onChange({ agentId: e.target.value.trim() ? Number(e.target.value) : null });
          }}
          placeholder="vd: 3"
          inputMode="numeric"
        />
      </SettingsField>
    </>
  );
}

import { Input } from '../../../../components/ui/input';
import { SettingsField } from '../settings-field';
import type { BackendFieldsProps } from './types';

export function HermesFields({ value, onChange }: BackendFieldsProps) {
  return (
    <>
      <SettingsField label="Hermes Gateway URL">
        <Input
          value={value.hermesGatewayUrl}
          onChange={(e) => onChange({ hermesGatewayUrl: e.target.value })}
          placeholder="http://localhost:8642"
        />
      </SettingsField>

      <SettingsField label="API Server Key">
        <Input
          value={value.hermesApiKey}
          onChange={(e) => onChange({ hermesApiKey: e.target.value })}
          placeholder="API_SERVER_KEY của Hermes"
          type="password"
        />
      </SettingsField>

      <SettingsField label="Model (để trống = mặc định server)">
        <Input
          value={value.hermesModel}
          onChange={(e) => onChange({ hermesModel: e.target.value })}
          placeholder="vd: hermes-4"
        />
      </SettingsField>
    </>
  );
}

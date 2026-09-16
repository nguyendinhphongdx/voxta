'use client';

import { SettingsIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { SettingsField } from './components/settings-field';
import { useGoogleVoices } from './hooks/use-google-voices';
import { useSettingsStore } from './store';
import type { VoxtaSettings } from '../../lib/settings';

interface SettingsViewProps {
  onClose: () => void;
}

const BACKEND_LABEL: Record<VoxtaSettings['backend'], string> = {
  ultron: 'Ultron',
  hermes: 'Hermes Agent',
  'claude-code': 'Claude Code',
  'tmux-agent': 'Terminal Agent (tmux)',
};

const TTS_PROVIDER_LABEL: Record<VoxtaSettings['ttsProvider'], string> = {
  browser: 'Trình duyệt (miễn phí, chất lượng thấp)',
  openai: 'OpenAI TTS',
  google: 'Google Cloud TTS',
};

const OPENAI_TTS_MODELS = ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'];
// Danh sách giọng OpenAI cố định — không có endpoint "list voices" như Google nên phải liệt kê
// tay theo docs (https://platform.openai.com/docs/guides/text-to-speech).
const OPENAI_TTS_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
];

/** languageCode suy từ tên giọng Google dạng "vi-VN-Wavenet-A" (2 segment đầu), else "vi-VN". */
function languageCodeFromVoiceName(voiceName: string): string {
  const parts = voiceName.split('-');
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'vi-VN';
}

/** Tách hẳn khỏi màn gọi chính — cấu hình backend không phải bề mặt chính end-user thấy hằng
 * ngày. Đọc/ghi settings qua `useSettingsStore` (SQLite phía server), không nhận props từ App
 * nữa. */
export function SettingsView({ onClose }: SettingsViewProps) {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);

  const [backend, setBackend] = useState(settings.backend);
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl);
  const [agentId, setAgentId] = useState(settings.agentId?.toString() ?? '');
  const [hermesGatewayUrl, setHermesGatewayUrl] = useState(settings.hermesGatewayUrl);
  const [hermesApiKey, setHermesApiKey] = useState(settings.hermesApiKey);
  const [hermesModel, setHermesModel] = useState(settings.hermesModel);
  const [claudeCodeProjectDir, setClaudeCodeProjectDir] = useState(settings.claudeCodeProjectDir);
  const [claudeCodeBinaryPath, setClaudeCodeBinaryPath] = useState(settings.claudeCodeBinaryPath);
  const [tmuxAgentCommand, setTmuxAgentCommand] = useState(settings.tmuxAgentCommand);
  const [tmuxAgentProjectDir, setTmuxAgentProjectDir] = useState(settings.tmuxAgentProjectDir);
  const [ttsProvider, setTtsProvider] = useState(settings.ttsProvider);
  const [openaiApiKey, setOpenaiApiKey] = useState(settings.openaiApiKey);
  const [openaiTtsModel, setOpenaiTtsModel] = useState(settings.openaiTtsModel);
  const [openaiTtsVoice, setOpenaiTtsVoice] = useState(settings.openaiTtsVoice);
  const [googleApiKey, setGoogleApiKey] = useState(settings.googleApiKey);
  const [googleLanguageCode, setGoogleLanguageCode] = useState(
    languageCodeFromVoiceName(settings.googleTtsVoice),
  );
  const [googleTtsVoice, setGoogleTtsVoice] = useState(settings.googleTtsVoice);

  const googleVoices = useGoogleVoices({
    enabled: ttsProvider === 'google',
    apiKey: googleApiKey,
    languageCode: googleLanguageCode,
  });

  const handleSave = () => {
    const next: VoxtaSettings = {
      backend,
      apiBaseUrl: apiBaseUrl.trim().replace(/\/$/, ''),
      agentId: agentId.trim() ? Number(agentId) : null,
      hermesGatewayUrl: hermesGatewayUrl.trim().replace(/\/$/, ''),
      hermesApiKey: hermesApiKey.trim(),
      hermesModel: hermesModel.trim(),
      claudeCodeProjectDir: claudeCodeProjectDir.trim(),
      claudeCodeBinaryPath: claudeCodeBinaryPath.trim() || 'claude',
      tmuxAgentCommand: tmuxAgentCommand.trim() || 'codex',
      tmuxAgentProjectDir: tmuxAgentProjectDir.trim(),
      ttsProvider,
      openaiApiKey: openaiApiKey.trim(),
      openaiTtsModel,
      openaiTtsVoice,
      googleApiKey: googleApiKey.trim(),
      googleTtsVoice: googleTtsVoice.trim(),
    };
    void save(next);
    onClose();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SettingsIcon className="size-4" />
          </span>
          <div>
            <CardTitle>Cài đặt</CardTitle>
            <CardDescription>Chọn backend và giọng đọc cho voxta</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <SettingsField label="Backend">
            <Select value={backend} onValueChange={(value) => setBackend(value as VoxtaSettings['backend'])}>
              <SelectTrigger className="w-full">
                <SelectValue>{(value: VoxtaSettings['backend']) => BACKEND_LABEL[value]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ultron">Ultron</SelectItem>
                <SelectItem value="hermes">Hermes Agent</SelectItem>
                <SelectItem value="claude-code">Claude Code</SelectItem>
                <SelectItem value="tmux-agent">Terminal Agent (tmux)</SelectItem>
              </SelectContent>
            </Select>
          </SettingsField>

          {backend === 'ultron' && (
            <>
              <SettingsField label="Ultron API URL">
                <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="http://localhost:8000" />
              </SettingsField>

              <SettingsField label="Agent ID (để trống = agent mặc định)">
                <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="vd: 3" inputMode="numeric" />
              </SettingsField>
            </>
          )}

          {backend === 'hermes' && (
            <>
              <SettingsField label="Hermes Gateway URL">
                <Input
                  value={hermesGatewayUrl}
                  onChange={(e) => setHermesGatewayUrl(e.target.value)}
                  placeholder="http://localhost:8642"
                />
              </SettingsField>

              <SettingsField label="API Server Key">
                <Input
                  value={hermesApiKey}
                  onChange={(e) => setHermesApiKey(e.target.value)}
                  placeholder="API_SERVER_KEY của Hermes"
                  type="password"
                />
              </SettingsField>

              <SettingsField label="Model (để trống = mặc định server)">
                <Input value={hermesModel} onChange={(e) => setHermesModel(e.target.value)} placeholder="vd: hermes-4" />
              </SettingsField>
            </>
          )}

          {backend === 'claude-code' && (
            <>
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                Claude Code sẽ chạy với quyền bỏ qua mọi xác nhận (
                <code>--dangerously-skip-permissions</code>) — có thể sửa file, chạy lệnh thật
                trong thư mục dưới đây chỉ dựa trên giọng nói bạn nhận diện được. Chỉ trỏ vào
                project bạn chấp nhận rủi ro đó.
              </p>
              <SettingsField label="Project Directory">
                <Input
                  value={claudeCodeProjectDir}
                  onChange={(e) => setClaudeCodeProjectDir(e.target.value)}
                  placeholder="/Users/ban/Code/du-an"
                />
              </SettingsField>
              <SettingsField label="Đường dẫn claude CLI (để trống = tự dò)">
                <Input
                  value={claudeCodeBinaryPath}
                  onChange={(e) => setClaudeCodeBinaryPath(e.target.value)}
                  placeholder="claude"
                />
              </SettingsField>
            </>
          )}

          {backend === 'tmux-agent' && (
            <>
              <p className="rounded-md border border-muted-foreground/30 bg-muted p-3 text-sm text-muted-foreground">
                Điều khiển 1 CLI agent tương tác thật (Codex, Claude Code...) bằng cách gõ phím +
                đọc màn hình qua tmux — dùng được với bất kỳ CLI nào chạy trong terminal, nhưng
                không đọc trả lời theo thời gian thực từng chữ được (phải đợi agent nói xong 1
                lượt mới đọc).
              </p>
              <SettingsField label="Lệnh khởi động">
                <Input
                  value={tmuxAgentCommand}
                  onChange={(e) => setTmuxAgentCommand(e.target.value)}
                  placeholder="codex"
                />
              </SettingsField>
              <SettingsField label="Project Directory">
                <Input
                  value={tmuxAgentProjectDir}
                  onChange={(e) => setTmuxAgentProjectDir(e.target.value)}
                  placeholder="/Users/ban/Code/du-an"
                />
              </SettingsField>
            </>
          )}

          {(backend === 'hermes' || backend === 'claude-code' || backend === 'tmux-agent') && (
            <>
              <div className="border-t pt-5">
                <SettingsField label="Giọng đọc trả lời">
                  <Select
                    value={ttsProvider}
                    onValueChange={(value) => setTtsProvider(value as VoxtaSettings['ttsProvider'])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{(value: VoxtaSettings['ttsProvider']) => TTS_PROVIDER_LABEL[value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="browser">Trình duyệt (miễn phí, chất lượng thấp)</SelectItem>
                      <SelectItem value="openai">OpenAI TTS</SelectItem>
                      <SelectItem value="google">Google Cloud TTS</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsField>
              </div>

              {ttsProvider === 'openai' && (
                <>
                  <SettingsField label="OpenAI API Key">
                    <Input
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      placeholder="sk-..."
                      type="password"
                    />
                  </SettingsField>
                  <SettingsField label="Model">
                    <Select value={openaiTtsModel} onValueChange={(value) => setOpenaiTtsModel(value ?? '')}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPENAI_TTS_MODELS.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingsField>
                  <SettingsField label="Giọng">
                    <Select value={openaiTtsVoice} onValueChange={(value) => setOpenaiTtsVoice(value ?? '')}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPENAI_TTS_VOICES.map((voice) => (
                          <SelectItem key={voice} value={voice}>
                            {voice}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingsField>
                </>
              )}

              {ttsProvider === 'google' && (
                <>
                  <SettingsField label="Google API Key">
                    <Input
                      value={googleApiKey}
                      onChange={(e) => setGoogleApiKey(e.target.value)}
                      placeholder="AIza..."
                      type="password"
                    />
                  </SettingsField>
                  <SettingsField label="Ngôn ngữ giọng">
                    <Input
                      value={googleLanguageCode}
                      onChange={(e) => setGoogleLanguageCode(e.target.value)}
                      placeholder="vd: vi-VN"
                    />
                  </SettingsField>
                  <SettingsField label="Giọng">
                    {googleVoices.loading ? (
                      <p className="text-sm text-muted-foreground">Đang tải danh sách giọng...</p>
                    ) : googleVoices.error ? (
                      <>
                        <p className="text-sm text-destructive">{googleVoices.error}</p>
                        <Input
                          value={googleTtsVoice}
                          onChange={(e) => setGoogleTtsVoice(e.target.value)}
                          placeholder="vd: vi-VN-Wavenet-A"
                        />
                      </>
                    ) : googleVoices.voices && googleVoices.voices.length > 0 ? (
                      <Select value={googleTtsVoice} onValueChange={(value) => setGoogleTtsVoice(value ?? '')}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {googleVoices.voices.map((voice) => (
                            <SelectItem key={voice.name} value={voice.name}>
                              {voice.name}
                              {voice.ssmlGender ? ` (${voice.ssmlGender})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={googleTtsVoice}
                        onChange={(e) => setGoogleTtsVoice(e.target.value)}
                        placeholder="Nhập API Key để tải danh sách, hoặc gõ tay vd: vi-VN-Wavenet-A"
                      />
                    )}
                  </SettingsField>
                </>
              )}
            </>
          )}
        </CardContent>

        <CardFooter className="justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" onClick={handleSave}>
            Lưu
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

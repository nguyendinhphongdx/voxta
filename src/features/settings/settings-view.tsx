'use client';

import { SettingsIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import type { VoxtaSettings } from '../../lib/settings';
import { BackendSelect } from './components/backend-select';
import { BACKEND_FIELDS } from './components/backends';
import { TtsProviderFields } from './components/tts-provider-fields';
import { useSettingsStore } from './store';

/** Orchestrator thuần — KHÔNG chứa field nào trực tiếp, chỉ ghép Tabs + form state + field-group
 * component theo backend đang chọn (`BACKEND_FIELDS`). Thêm backend mới: viết 1 file trong
 * `components/backends/` + thêm 1 dòng vào map đó, không cần sửa file này nữa. */
export function SettingsView() {
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);

  const [form, setForm] = useState<VoxtaSettings>(settings);
  const patch = (p: Partial<VoxtaSettings>) => setForm((prev) => ({ ...prev, ...p }));

  const handleSave = () => {
    const trimmed: VoxtaSettings = {
      ...form,
      apiBaseUrl: form.apiBaseUrl.trim().replace(/\/$/, ''),
      hermesGatewayUrl: form.hermesGatewayUrl.trim().replace(/\/$/, ''),
      hermesApiKey: form.hermesApiKey.trim(),
      hermesModel: form.hermesModel.trim(),
      claudeCodeProjectDir: form.claudeCodeProjectDir.trim(),
      claudeCodeBinaryPath: form.claudeCodeBinaryPath.trim() || 'claude',
      tmuxAgentCommand: form.tmuxAgentCommand.trim() || 'codex',
      tmuxAgentProjectDir: form.tmuxAgentProjectDir.trim(),
      openaiApiKey: form.openaiApiKey.trim(),
      googleApiKey: form.googleApiKey.trim(),
      googleTtsVoice: form.googleTtsVoice.trim(),
    };
    void save(trimmed);
    router.push('/');
  };

  const BackendFields = BACKEND_FIELDS[form.backend];

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

        <CardContent>
          <Tabs defaultValue="backend">
            <TabsList className="mb-5 w-full">
              <TabsTrigger value="backend">Backend</TabsTrigger>
              <TabsTrigger value="voice">Giọng đọc</TabsTrigger>
            </TabsList>

            <TabsContent value="backend" className="flex flex-col gap-5">
              <BackendSelect value={form.backend} onChange={(backend) => patch({ backend })} />
              <BackendFields value={form} onChange={patch} />
            </TabsContent>

            <TabsContent value="voice">
              <TtsProviderFields value={form} onChange={patch} />
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/')}>
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

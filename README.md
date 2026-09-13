# voxta

Client voice-first, tối giản, kết nối nhiều backend agent khác nhau — chạm 1 nút, nói, nghe trả
lời, không phải chat text/config kỹ thuật như UI mặc định của các agent platform (Hermes Agent,
Ultron...).

> Tên "voxta" là tên tạm (ghép "vox" — tiếng Latin nghĩa "giọng nói" — với hậu tố ngắn), đổi tuỳ ý.

## Kiến trúc

- `src/connectors/types.ts` — `VoiceBackendConnector` interface chung, mọi backend implement.
  CallScreen chỉ biết interface này, không biết bên trong mỗi backend làm gì.
- `src/connectors/ultron/UltronConnector.ts` — backend đầu tiên (Phase 1). Mô hình **relay đầy
  đủ**: tạo `Conversation` qua REST API của Ultron, mở WebSocket `/conversations/{id}/voice`,
  Ultron tự giữ kết nối tới Gemini Live và relay 2 chiều — voxta không bao giờ nói chuyện thẳng
  với Gemini.
- `src/audio/` — mic capture (AudioWorklet 16kHz PCM) + playback streaming (24kHz PCM, hỗ trợ
  barge-in).
- `src/screens/CallScreen.tsx` — màn hình chính, CHỈ 1 nút tròn + trạng thái
  (nghe/nghĩ/nói), không có transcript/chat log mặc định.
- `src/screens/SettingsScreen.tsx` — cấu hình backend, tách hẳn khỏi màn gọi chính.

**Phase 2 (chưa làm)**: connector cho Hermes Agent — khác hẳn mô hình Ultron, Hermes (qua plugin
`hermes-talk`) chỉ mint 1 "ephemeral secret" rồi client tự nói chuyện THẲNG với provider (OpenAI
Realtime/GPT-Live) — cần tự implement wire protocol đó phía client trước, chưa có SDK browser
chính thức.

## Chạy thử

```bash
pnpm install
pnpm dev
```

Cần 1 backend Ultron đang chạy (`apps/api` + Postgres) — mở Settings trong app, nhập:
- Ultron API URL (mặc định `http://localhost:8000`)
- Agent ID (để trống = agent mặc định theo `AppSettings` của Ultron)

**Lưu ý CORS**: Ultron mặc định chỉ cho phép origin `localhost:3010` — cần thêm origin dev của
voxta (`http://localhost:5173`) vào `CORS_ORIGINS` trong `apps/api/.env` của Ultron rồi restart
server đó, nếu không request tạo conversation sẽ bị chặn.

## Verification đã làm

Live-test thật qua Chrome (Playwright, fake mic device) + Ultron backend thật (Postgres + Gemini
credential thật): tạo conversation → mở voice WebSocket → mic capture streaming → nhận state
`listening` đúng — không lỗi server-side (`voice.session_started` → `voice.session_ended` sạch).
Chưa test giọng nói thật (fake mic device chỉ phát audio synthetic, không phải giọng người) — cần
tự thử tay qua mic thật để nghe Gemini trả lời.

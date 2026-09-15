# voxta

Client voice-first, tối giản, kết nối nhiều backend agent khác nhau — chạm 1 nút, nói, nghe trả
lời, không phải chat text/config kỹ thuật như UI mặc định của các agent platform (Hermes Agent,
Ultron...).

> Tên "voxta" là tên tạm (ghép "vox" — tiếng Latin nghĩa "giọng nói" — với hậu tố ngắn), đổi tuỳ ý.

## Kiến trúc

Next.js App Router — 1 process vừa serve frontend vừa có API route riêng, thay vì Vite thuần
trước đây (đổi vì cần chỗ chạy `better-sqlite3` phía server cho settings).

- `src/connectors/types.ts` — `VoiceBackendConnector` interface chung, mọi backend implement.
  CallScreen chỉ biết interface này, không biết bên trong mỗi backend làm gì. Có cờ
  `managesOwnAudio` cho backend tự giữ mic/loa riêng (Hermes) thay vì dùng chung
  `MicCapture`/`AudioPlayer` (Ultron).
- `src/connectors/ultron/UltronConnector.ts` — mô hình **relay đầy đủ**: tạo `Conversation` qua
  REST API của Ultron, mở WebSocket `/conversations/{id}/voice`, Ultron tự giữ kết nối tới Gemini
  Live và relay 2 chiều — voxta không bao giờ nói chuyện thẳng với Gemini.
- `src/connectors/hermes/HermesConnector.ts` — Hermes Agent chỉ có Gateway API dạng
  OpenAI-compatible (text-in/text-out thuần HTTP, không có voice model native), nên connector tự
  làm STT + VAD bằng Web Speech API (`SpeechRecognition`, continuous — tự phát hiện lúc người
  dùng ngừng nói, không cần bấm nút) và TTS bằng `SpeechSynthesis`, gọi `POST
  /v1/chat/completions` ở giữa. Chỉ chạy tốt trên Chrome/Edge; cần cấp quyền mic cho trình duyệt
  (và cho trình duyệt ở cấp hệ điều hành trên macOS).
- `src/audio/` — mic capture (AudioWorklet 16kHz PCM) + playback streaming (24kHz PCM, hỗ trợ
  barge-in) — dùng cho Ultron, Hermes không đụng tới các module này.
- `src/lib/db.ts` + `src/app/api/settings/route.ts` — settings lưu SQLite (`data/voxta.db`, tự
  tạo, gitignored) thay vì `localStorage` — mọi browser/tab trỏ vào cùng server voxta thấy chung 1
  config, không lệch nhau như trước.
- `src/screens/CallScreen.tsx` — màn hình chính, 1 nút tròn + label trạng thái + waveform nhỏ
  (animation theo trạng thái nghe/nghĩ/nói, không phải audio-reactive thật) — không có
  transcript/chat log mặc định.
- `src/screens/SettingsScreen.tsx` — chọn backend (Ultron/Hermes) + cấu hình tương ứng, tách hẳn
  khỏi màn gọi chính.

## Chạy thử

```bash
pnpm install
pnpm dev
```

Mở `http://localhost:3000`, vào Settings chọn backend:

**Ultron** — cần 1 backend Ultron đang chạy (`apps/api` + Postgres):
- Ultron API URL (mặc định `http://localhost:8000`)
- Agent ID (để trống = agent mặc định theo `AppSettings` của Ultron)

**Lưu ý CORS**: Ultron mặc định chỉ cho phép origin `localhost:3010` — cần thêm origin của voxta
(`http://localhost:3000`) vào `CORS_ORIGINS` trong `apps/api/.env` của Ultron rồi restart server
đó, nếu không request tạo conversation sẽ bị chặn.

**Hermes Agent** — cần Gateway API đang chạy (`docker compose up -d` trong
`tools/hermes-agent`, xem `API_SERVER_ENABLED`/`API_SERVER_KEY` trong `tools/hermes-agent/README.md`):
- Hermes Gateway URL (mặc định `http://localhost:8642`)
- API Server Key — **lưu ý**: key thật Hermes dùng nằm trong `data/.env` bên trong container
  (`docker exec hermes-agent printenv API_SERVER_KEY`), KHÁC file `.env` ở
  `tools/hermes-agent/.env` dùng để cấu hình docker-compose.
- Model (vd `hermes-agent`, để trống dùng mặc định server)

## Verification đã làm

Live-test thật qua Chrome (Playwright, fake mic device) + Ultron backend thật (Postgres + Gemini
credential thật): tạo conversation → mở voice WebSocket → mic capture streaming → nhận state
`listening` đúng — không lỗi server-side (`voice.session_started` → `voice.session_ended` sạch).
Chưa test giọng nói thật (fake mic device chỉ phát audio synthetic, không phải giọng người) — cần
tự thử tay qua mic thật để nghe Gemini trả lời.

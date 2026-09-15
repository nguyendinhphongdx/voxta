# voxta

**Voice-first client cho các agent platform tự host** — chạm 1 nút, nói, nghe trả lời. Không có
chat log, không có bảng cấu hình kỹ thuật lộ thiên như UI mặc định của Ultron hay Hermes Agent —
chỉ một trải nghiệm gọi thoại tối giản, đứng trước nhiều backend khác nhau qua cùng một giao diện.

> Tên "voxta" là tên tạm (ghép *vox* — tiếng Latin nghĩa "giọng nói" — với hậu tố ngắn gọn), đổi
> tuỳ ý khi dự án cần một cái tên chính thức.

## Tính năng

- **1 nút, 3 trạng thái** — nghe / nghĩ / nói, thể hiện bằng orb phát sáng đổi màu + waveform,
  không cần giao diện chat.
- **Backend-agnostic** — cùng 1 giao diện, đổi qua lại giữa nhiều agent platform mà không đổi UI.
- **Hai backend đã hỗ trợ**:
  - **Ultron** — relay đầy đủ qua WebSocket, backend tự giữ kết nối Gemini Live.
  - **Hermes Agent** — chỉ có Gateway API dạng text (OpenAI-compatible), nên voxta tự lo toàn bộ
    voice pipeline ở client: nhận diện giọng nói, phát hiện lúc dừng nói bằng VAD thật (không phải
    đếm giờ), và đọc trả lời — có thể chọn giữa giọng miễn phí của trình duyệt hoặc TTS thật
    (OpenAI, Google Cloud).
- **Trả lời được đọc theo từng câu ngay khi model sinh ra** (streaming), audio của câu kế tiếp
  được tải trước trong lúc câu hiện tại đang phát — không có khoảng lặng chờ mạng giữa các câu.
- **Cấu hình dùng chung mọi thiết bị** — lưu SQLite phía server thay vì `localStorage`, nên mở
  voxta từ browser/máy nào trỏ vào cùng server cũng thấy đúng 1 cấu hình.

## Kiến trúc

Next.js App Router — một process vừa serve frontend vừa có API route riêng (cần chạy trên server
vì `better-sqlite3` là native module, và để giấu API key của các TTS provider khỏi trình duyệt).

**Tech stack**: Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) ·
Zustand · better-sqlite3 · `@ricky0123/vad-web` (Silero VAD)

### Cấu trúc thư mục

```
src/
├── app/                      # Next.js App Router
│   ├── api/
│   │   ├── settings/         # GET/PUT settings (SQLite)
│   │   └── tts/               # Proxy TTS thật (OpenAI/Google) + danh sách giọng
│   ├── layout.tsx / page.tsx / globals.css
│
├── features/                 # UI theo tính năng — mỗi feature có store + hooks + components
│   ├── call/                 #   màn gọi chính (CallOrb, VoiceWave, useCallStore)
│   └── settings/              #   màn cấu hình (SettingsField, useGoogleVoices, useSettingsStore)
│
├── connectors/                # Backend-agnostic voice pipeline
│   ├── types.ts               #   VoiceBackendConnector — interface chung mọi backend implement
│   ├── create-connector.ts    #   factory: settings -> connector cụ thể
│   ├── ultron/                #   relay đầy đủ qua WebSocket
│   └── hermes/                #   Web Speech STT/TTS + Silero VAD + streaming reply
│
├── audio/                     # Mic capture (AudioWorklet) + playback streaming — dùng cho Ultron
├── components/ui/             # shadcn/ui primitives
└── lib/                       # settings (client+server), SQLite (db.ts), cn() helper
```

### Nguyên tắc thiết kế

- **`VoiceBackendConnector`** (`src/connectors/types.ts`) là ranh giới duy nhất giữa UI và backend
  thật — `CallView` không biết Ultron hay Hermes làm gì bên trong, chỉ gọi qua interface này. Thêm
  backend mới chỉ cần viết 1 connector + thêm 1 case vào `create-connector.ts`.
- Connector có cờ **`managesOwnAudio`**: Ultron dùng chung `MicCapture`/`AudioPlayer` của voxta;
  Hermes tự giữ mic/loa riêng (Web Speech API + Silero VAD) vì không có voice model native — hai
  connector không tranh nhau quyền truy cập mic.
- **State quản lý bằng Zustand** (`useCallStore`, `useSettingsStore`) — không prop-drilling qua
  nhiều tầng component.
- Mọi màu trạng thái cuộc gọi (nghe/nghĩ/nói/lỗi) là **design token** (`--voice-*` trong
  `globals.css`), dùng lại xuyên suốt CallOrb, VoiceWave và pill badge trạng thái.

## Bắt đầu nhanh

**Yêu cầu**: Node.js 22+, pnpm, Chrome hoặc Edge (backend Hermes dùng Web Speech API — không chạy
trên Safari/Firefox).

```bash
pnpm install
pnpm dev
```

Mở `http://localhost:3000`, bấm biểu tượng cài đặt để chọn backend.

### Cấu hình Ultron

Cần 1 backend Ultron đang chạy (`apps/api` + Postgres):

| Field | Ghi chú |
|---|---|
| Ultron API URL | mặc định `http://localhost:8000` |
| Agent ID | để trống = agent mặc định theo `AppSettings` của Ultron |

> **CORS**: Ultron mặc định chỉ cho phép origin `localhost:3010` — cần thêm origin của voxta
> (`http://localhost:3000`) vào `CORS_ORIGINS` trong `apps/api/.env` của Ultron rồi restart server
> đó, nếu không request tạo conversation sẽ bị chặn.

### Cấu hình Hermes Agent

Cần Gateway API của Hermes đang chạy (`docker compose up -d` trong `tools/hermes-agent` — xem
`API_SERVER_ENABLED`/`API_SERVER_KEY` trong README của thư mục đó):

| Field | Ghi chú |
|---|---|
| Hermes Gateway URL | mặc định `http://localhost:8642` |
| API Server Key | **lưu ý**: key thật nằm trong `data/.env` **bên trong container** (`docker exec hermes-agent printenv API_SERVER_KEY`) — khác file `tools/hermes-agent/.env` dùng để cấu hình docker-compose |
| Model | vd `hermes-agent`, để trống dùng mặc định server |

**Giọng đọc trả lời** (chỉ áp dụng cho Hermes — Ultron dùng thẳng voice model của Gemini Live):

- **Trình duyệt** (mặc định) — miễn phí, dùng `SpeechSynthesis` có sẵn, chất lượng thấp.
- **OpenAI TTS** — cần API key từ [platform.openai.com](https://platform.openai.com/api-keys).
- **Google Cloud TTS** — cần bật *Cloud Text-to-Speech API* trong Google Cloud Console và tạo API
  key dạng `AIzaSy...` (**không phải** key kiểu Google AI Studio/Gemini). Danh sách giọng theo
  ngôn ngữ được tải trực tiếp từ Google khi đã nhập key.

## Giới hạn hiện tại

- Backend Hermes chỉ chạy tốt trên **Chrome/Edge** (Web Speech API không được Safari/Firefox hỗ
  trợ đầy đủ).
- VAD (`@ricky0123/vad-web`) tải model ONNX từ CDN lúc bắt đầu cuộc gọi — cần Internet ở bước đó,
  khác các phần còn lại của voxta vốn chạy được hoàn toàn trong mạng LAN.
- Hermes chưa hỗ trợ barge-in (ngắt lời model đang đọc) — mic tạm dừng trong lúc TTS phát để tránh
  tự bắt lại tiếng loa của chính nó.

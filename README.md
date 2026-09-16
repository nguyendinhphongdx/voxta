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
- **Bốn backend đã hỗ trợ**:
  - **Ultron** — relay đầy đủ qua WebSocket, backend tự giữ kết nối Gemini Live.
  - **Hermes Agent** — chỉ có Gateway API dạng text (OpenAI-compatible), nên voxta tự lo toàn bộ
    voice pipeline ở client: nhận diện giọng nói, phát hiện lúc dừng nói bằng VAD thật (không phải
    đếm giờ), và đọc trả lời — có thể chọn giữa giọng miễn phí của trình duyệt hoặc TTS thật
    (OpenAI, Google Cloud).
  - **Claude Code** — điều khiển 1 project code thật bằng giọng nói: server chạy `claude -p`
    headless như subprocess, voxta nói lại kết quả. Dùng chung voice pipeline với Hermes.
  - **Terminal Agent (tmux)** — generic cho BẤT KỲ CLI agent tương tác nào (Codex, Claude Code,
    Aider...): server tự mở 1 session tmux chạy agent đó, gõ/đọc màn hình thay vì dùng flag JSON
    riêng của từng agent. Đổi lại không streaming theo token thật (phải đợi agent nói xong 1 lượt
    mới đọc).
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
│   ├── voice-text-bridge.ts   #   base dùng chung cho backend chỉ có text (STT/VAD/TTS/hàng đợi)
│   ├── create-connector.ts    #   factory: settings -> connector cụ thể
│   ├── ultron/                #   relay đầy đủ qua WebSocket
│   ├── hermes/                #   HermesConnector — Gateway API OpenAI-compatible
│   ├── claude-code/           #   ClaudeCodeConnector — gọi `claude` CLI qua route nội bộ
│   └── tmux-agent/            #   TmuxAgentConnector — điều khiển agent bất kỳ qua tmux
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
  Hermes và Claude Code tự giữ mic/loa riêng (Web Speech API + Silero VAD, qua
  `VoiceTextBridgeConnector`) vì không có voice model native — các connector không tranh nhau
  quyền truy cập mic.
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

### Cấu hình Claude Code

Cần [Claude Code CLI](https://claude.com/claude-code) đã cài và đăng nhập trên máy chạy voxta
(`claude` phải nằm trong `PATH` của process chạy `pnpm dev`/`pnpm start`).

| Field | Ghi chú |
|---|---|
| Project Directory | thư mục Claude Code sẽ chạy trong đó — bắt buộc, không có mặc định |

> **⚠️ Cảnh báo**: backend này chạy `claude -p` với `--dangerously-skip-permissions` — Claude Code
> có thể sửa file, chạy lệnh thật trong Project Directory **không cần xác nhận**, chỉ dựa trên văn
> bản STT nhận diện được từ giọng nói. Nghe nhầm 1 câu có thể vô tình kích hoạt 1 thao tác không
> mong muốn. Chỉ trỏ vào project bạn chấp nhận rủi ro đó, và cân nhắc dùng git để dễ revert nếu cần.

Mỗi lượt nói là 1 lần gọi `claude -p` mới; lịch sử hội thoại trong **cùng 1 cuộc gọi** được nối
bằng `--resume <session-id>` (session mới cho mỗi lần bấm nút gọi lại).

### Cấu hình Terminal Agent (tmux)

Cần [tmux](https://github.com/tmux/tmux) đã cài trên máy chạy voxta, và CLI agent bạn muốn dùng
(`codex`, `claude`...) đã cài + đăng nhập sẵn.

| Field | Ghi chú |
|---|---|
| Lệnh khởi động | lệnh chạy trong tmux, vd `codex` hoặc `claude` |
| Project Directory | thư mục agent sẽ chạy trong đó — bắt buộc |

Mỗi cuộc gọi voxta tạo 1 session tmux mới (`voxta-<uuid>`), gõ tin nhắn bằng `tmux send-keys` và
đọc trả lời bằng cách chụp màn hình (`tmux capture-pane`) rồi chờ màn hình "đứng yên" — không có
event "đã xong" rõ ràng như JSON nên đây là cách suy luận tốt nhất có thể với raw terminal. Session
tự đóng khi cuộc gọi kết thúc.

**Giọng đọc trả lời** (chung cho Hermes, Claude Code và Terminal Agent — Ultron dùng thẳng voice
model của Gemini Live):

- **Trình duyệt** (mặc định) — miễn phí, dùng `SpeechSynthesis` có sẵn, chất lượng thấp.
- **OpenAI TTS** — cần API key từ [platform.openai.com](https://platform.openai.com/api-keys).
- **Google Cloud TTS** — cần bật *Cloud Text-to-Speech API* trong Google Cloud Console và tạo API
  key dạng `AIzaSy...` (**không phải** key kiểu Google AI Studio/Gemini). Danh sách giọng theo
  ngôn ngữ được tải trực tiếp từ Google khi đã nhập key.

## Giới hạn hiện tại

- Backend Hermes, Claude Code và Terminal Agent chỉ chạy tốt trên **Chrome/Edge** (Web Speech API
  không được Safari/Firefox hỗ trợ đầy đủ).
- Terminal Agent không streaming theo token thật (phải chờ agent nói xong 1 lượt mới đọc) — đây là
  giới hạn cố hữu của cách gõ/đọc màn hình, không phải bug.
- VAD (`@ricky0123/vad-web`) tải model ONNX từ CDN lúc bắt đầu cuộc gọi — cần Internet ở bước đó,
  khác các phần còn lại của voxta vốn chạy được hoàn toàn trong mạng LAN.
- Không backend nào hỗ trợ barge-in (ngắt lời model đang đọc) — mic tạm dừng trong lúc TTS phát để
  tránh tự bắt lại tiếng loa của chính nó.
- Claude Code chạy với `--dangerously-skip-permissions` — xem cảnh báo ở phần cấu hình phía trên.

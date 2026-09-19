import { MicVAD } from '@ricky0123/vad-web';

import { pauseSharedAudio, playAudioBlob } from '../lib/unlock-audio-playback';
import type { VoiceBackendConnector, VoiceEvent } from './types';

// Pin đúng version — asset (model ONNX + wasm) tải từ CDN jsdelivr theo version này, lệch
// version base package/asset dễ vỡ (API/format model đổi giữa các bản).
const VAD_WEB_VERSION = '0.0.31';
const ONNXRUNTIME_WEB_VERSION = '1.22.0';

/** Web Speech API không có type chuẩn trong lib.dom.d.ts — khai báo tối thiểu phần dùng tới. */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex: number;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Bỏ hẳn code block ```...``` khỏi text trước khi đọc — đọc code thô bằng giọng nói vô nghĩa.
 * Chỉ khớp block ĐÃ ĐÓNG (```...``` trọn vẹn) — 1 fence mở dở dang (stream chưa tới đoạn đóng) cố
 * tình không khớp, ở lại trong buffer chờ delta sau, tránh cắt ngang code block giữa chừng. */
function stripClosedCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' (đoạn code). ');
}

/** Bỏ markdown inline phổ biến (đậm/nghiêng/inline-code/link/heading/bullet) — đọc nguyên ký hiệu
 * `**`/`` ` ``/`[]()`/`#`/`- ` lên nghe rất kỳ. Áp dụng cho từng CÂU đã cắt xong (không phải cả
 * buffer đang stream) vì các ký hiệu này luôn nằm trọn trong 1 câu. */
function sanitizeForSpeech(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

/** Tách các câu ĐÃ hoàn chỉnh (kết thúc bằng . ! ? … theo sau khoảng trắng thật — không tính hết
 * chuỗi hiện tại là "hoàn chỉnh" vì stream có thể tiếp tục ở delta kế tiếp) ra khỏi phần đuôi còn
 * dang dở. Dùng để đọc từng câu ngay khi có, thay vì chờ hết cả câu trả lời mới đọc. */
function extractCompleteSentences(text: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const regex = /[^.!?…]*[.!?…]+\s+/g;
  let match: RegExpExecArray | null;
  let consumedLength = 0;
  while ((match = regex.exec(text)) !== null) {
    sentences.push(match[0].trim());
    consumedLength = regex.lastIndex;
  }
  return { sentences, rest: text.slice(consumedLength) };
}

/** Sau khi VAD báo hết nói, chờ thêm chút cho SpeechRecognition (STT) kịp bắt từ cuối cùng —
 * VAD (dựa trên audio) và STT (dựa trên ngôn ngữ) không tuyệt đối đồng bộ với nhau. */
const VAD_COMMIT_GRACE_MS = 250;

/** Event có cấu trúc mà subclass phát ra NGOÀI text trả lời chính (Conversation view hiển thị,
 * pipeline Live/TTS bỏ qua — chỉ đọc to phần `onDelta` text) — hiện chỉ Claude Code phát loại
 * event này thật (Hermes/Tmux chỉ có text). */
export type AssistantStreamEvent =
  | { type: 'thinking-delta'; text: string }
  | { type: 'tool-call-start'; id: string; name: string }
  | { type: 'tool-call-input'; id: string; input: unknown }
  | { type: 'tool-result'; id: string; output: unknown };

export interface VoiceTextBridgeConfig {
  /** Ngôn ngữ cho SpeechRecognition/SpeechSynthesis (BCP-47), vd "vi-VN". */
  language: string;
  /** 'browser' đọc bằng SpeechSynthesis miễn phí có sẵn (chất lượng thấp); 'openai'/'google' gọi
   * TTS thật qua proxy server `/api/tts` (key không lộ ra browser — xem route đó). */
  ttsProvider: 'browser' | 'openai' | 'google';
}

/** Base cho các backend chỉ có giao tiếp dạng TEXT (không có voice model native) — Hermes Agent,
 * Claude Code CLI, và bất kỳ backend text-in/text-out nào sau này. Tự lo toàn bộ voice pipeline
 * trong trình duyệt: SpeechRecognition chỉ để LẤY CHỮ (transcript liên tục, không tự quyết định
 * lúc nào xong), `@ricky0123/vad-web` (Silero VAD thật, ML-based) qua `onSpeechEnd` để PHÁT HIỆN
 * "người dùng đã nói xong" — chính xác và nhanh hơn hẳn so với chờ trình duyệt tự chốt `isFinal`
 * (có lúc mất vài giây) hay đếm giờ cứng. Trả lời được đọc theo từng câu ngay khi đủ dấu câu
 * (subclass cung cấp qua `fetchAssistantReply`'s `onDelta`), audio TTS của câu kế tiếp được
 * prefetch song song trong lúc câu hiện tại đang phát — không có khoảng lặng chờ mạng giữa các
 * câu. `managesOwnAudio = true` vì cả STT lẫn VAD tự giữ mic riêng — useVoiceCall/useCallStore
 * không mở thêm MicCapture/AudioPlayer chung nữa. Lưu ý: VAD tải model ONNX từ CDN jsdelivr lúc
 * `connect()` — cần Internet ở bước đó. Trong lúc TTS đang đọc, tạm dừng cả STT lẫn VAD để mic
 * không tự bắt lại tiếng loa (không có echo cancellation giữa SpeechSynthesis/`<audio>` và mic). */
export abstract class VoiceTextBridgeConnector implements VoiceBackendConnector {
  readonly inputSampleRate = 0;
  readonly outputSampleRate = 0;
  readonly managesOwnAudio = true;

  protected readonly config: VoiceTextBridgeConfig;
  private handlers = new Set<(event: VoiceEvent) => void>();
  private recognition: SpeechRecognitionLike | null = null;
  private micVad: MicVAD | null = null;
  private shouldListen = false;
  private closed = false;
  private pendingTranscript = '';
  /** Hàng đợi câu chờ phát — mỗi câu vào hàng đợi là bắt đầu fetch TTS NGAY (không chờ tới lượt
   * phát), nên khi câu trước phát xong, audio câu sau thường đã sẵn sàng — không có khoảng lặng
   * chờ mạng giữa các câu. `audio` là `null` cho ttsProvider 'browser' (SpeechSynthesis không
   * cần prefetch, tự nhận text). Xem `enqueueSpeech`/`drainSpeechQueue`. */
  private speechQueue: Array<{ text: string; audio: Promise<Blob> | null }> = [];
  private speaking = false;
  /** true từ lúc 1 lượt được chốt (VAD onSpeechEnd hoặc isFinal) tới lúc resumeListening() —
   * chặn onresult xử lý lần 2: gọi recognition.stop() để tạm dừng nghe khiến trình duyệt bắn
   * thêm 1 `onresult` isFinal "dọn dẹp" cho CÙNG câu vừa chốt, nếu không chặn sẽ gửi request
   * trùng (đã gặp thật khi test). */
  private utteranceInFlight = false;

  constructor(config: VoiceTextBridgeConfig) {
    this.config = config;
  }

  private emit(event: VoiceEvent): void {
    for (const handler of this.handlers) handler(event);
  }

  on(handler: (event: VoiceEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async connect(): Promise<void> {
    const Recognition = getSpeechRecognitionCtor();
    if (!Recognition) {
      throw new Error(
        'Trình duyệt này không hỗ trợ nhận dạng giọng nói (Web Speech API) — cần Chrome/Edge.',
      );
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    // interimResults=true để tự theo dõi lúc nào ngừng có update mới thay vì chờ trình duyệt tự
    // chốt `isFinal` — cách đó có thể mất vài giây mới xong.
    recognition.interimResults = true;
    recognition.lang = this.config.language;

    // Chỉ để LẤY CHỮ liên tục — không tự quyết định lúc nào "xong", VAD lo việc đó (xem dưới).
    recognition.onresult = (event) => {
      if (this.utteranceInFlight) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        this.pendingTranscript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          // Trình duyệt tự chốt xong trước cả VAD (câu ngắn) — dùng luôn, khỏi chờ thêm.
          const text = this.pendingTranscript.trim();
          this.pendingTranscript = '';
          if (text) void this.handleUserUtterance(text);
        }
      }
    };
    recognition.onerror = (event) => {
      // "no-speech"/"aborted" là chuyện bình thường của chế độ continuous (im lặng quá lâu,
      // hay do chính mình gọi stop() để tạm dừng khi TTS đọc) — onend lo việc khởi động lại.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      // "not-allowed"/"service-not-allowed" trên Safari/WebKit KHÔNG phải do từ chối quyền mic —
      // `webkitSpeechRecognition` tồn tại trên Safari (nên getSpeechRecognitionCtor() ở trên tưởng
      // dùng được) nhưng chưa bao giờ thật sự hoạt động, luôn lỗi này ngay khi start() — đã tái
      // hiện thật, xác nhận đây là giới hạn nền tảng (mọi trình duyệt trên iOS đều chạy trên
      // WebKit, kể cả Chrome/Firefox-trên-iOS chỉ là vỏ bọc Safari), không phải lỗi cấu hình hay
      // quyền truy cập có thể sửa được từ phía voxta. Thông báo rõ nguyên nhân thay vì mã lỗi kỹ
      // thuật khó hiểu.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.emit({
          type: 'error',
          message:
            'Trình duyệt này không hỗ trợ nhận diện giọng nói thật (giới hạn của Safari/WebKit — ' +
            'ảnh hưởng MỌI trình duyệt trên iOS, không riêng Safari). Dùng chế độ gõ chat ở trang ' +
            'chủ thay vì Live, hoặc mở voxta bằng Chrome/Edge trên máy tính/Android.',
        });
        return;
      }
      this.emit({ type: 'error', message: `Lỗi nhận dạng giọng nói: ${event.error}` });
    };
    recognition.onend = () => {
      if (this.shouldListen && !this.closed) {
        try {
          recognition.start();
        } catch {
          // Đã start rồi (race hiếm) — bỏ qua, lần onend kế tiếp sẽ tự thử lại.
        }
      }
    };

    this.recognition = recognition;

    try {
      this.micVad = await MicVAD.new({
        onSpeechEnd: () => this.onVadSpeechEnd(),
        onnxWASMBasePath: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNXRUNTIME_WEB_VERSION}/dist/`,
        baseAssetPath: `https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@${VAD_WEB_VERSION}/dist/`,
      });
    } catch (err) {
      throw new Error(
        `Không khởi tạo được VAD (@ricky0123/vad-web): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.shouldListen = true;
    recognition.start();
    this.micVad.start();
    this.emit({ type: 'state', value: 'listening' });
  }

  /** VAD (audio) báo hết nói — chờ chút cho STT (ngôn ngữ) kịp bắt từ cuối rồi mới chốt câu. */
  private onVadSpeechEnd(): void {
    if (this.utteranceInFlight) return;
    setTimeout(() => {
      if (this.utteranceInFlight) return;
      const text = this.pendingTranscript.trim();
      this.pendingTranscript = '';
      if (text) void this.handleUserUtterance(text);
    }, VAD_COMMIT_GRACE_MS);
  }

  private async handleUserUtterance(text: string): Promise<void> {
    if (this.utteranceInFlight) return;
    this.utteranceInFlight = true;
    this.emit({ type: 'transcript-delta', role: 'user', text });

    // Tạm dừng nghe (cả STT lẫn VAD) trong lúc chờ + đọc trả lời — tránh mic tự bắt lại tiếng
    // loa (không có echo cancellation giữa SpeechSynthesis/`<audio>` và mic).
    this.shouldListen = false;
    this.recognition?.stop();
    this.micVad?.pause();
    this.emit({ type: 'state', value: 'thinking' });

    try {
      await this.streamReply(text);
    } catch (err) {
      this.emit({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không gọi được backend.',
      });
    }
  }

  /** Đọc từng câu ngay khi đủ dấu câu — không chờ cả câu trả lời xong mới bắt đầu đọc. */
  private async streamReply(userText: string): Promise<void> {
    let sentenceBuffer = '';
    await this.fetchAssistantReply(userText, (delta) => {
      if (!delta) return;
      this.emit({ type: 'transcript-delta', role: 'model', text: delta });
      sentenceBuffer = stripClosedCodeBlocks(sentenceBuffer + delta);
      const { sentences, rest } = extractCompleteSentences(sentenceBuffer);
      sentenceBuffer = rest;
      for (const sentence of sentences) this.enqueueSpeech(sanitizeForSpeech(sentence));
    });

    this.enqueueSpeech(sanitizeForSpeech(sentenceBuffer)); // câu cuối thường không có khoảng trắng theo sau
    // Reply rỗng hoàn toàn (không câu nào được enqueue) — không gì kích hoạt resumeListening
    // qua drainSpeechQueue nữa, phải tự gọi.
    if (!this.speaking && this.speechQueue.length === 0) this.resumeListening();
  }

  /** Subclass gọi API thật (Hermes Gateway, Claude Code CLI qua route nội bộ...) cho `userText`,
   * gọi `onDelta` mỗi khi có thêm chữ mới của câu trả lời. Phải resolve sau khi model nói xong
   * lượt này (không cần trả về gì — bridge tự quản lý phần đọc/hàng đợi TTS). `onEvent` optional —
   * chỉ Claude Code dùng để phát thinking/tool-call/tool-result (Conversation view); pipeline Live
   * ở trên gọi `fetchAssistantReply` KHÔNG truyền `onEvent`, nên các event này tự động bị bỏ qua
   * lúc đang gọi thoại (không đọc to nội dung thinking/tool ra loa). */
  protected abstract fetchAssistantReply(
    userText: string,
    onDelta: (delta: string) => void,
    onEvent?: (event: AssistantStreamEvent) => void,
  ): Promise<void>;

  /** Gửi 1 tin nhắn TEXT thuần cho chat gõ tay (Conversation view) — KHÔNG qua mic/VAD/TTS, không
   * cần `connect()` trước (không đụng STT/VAD nội bộ ở trên). Dùng chung `fetchAssistantReply` với
   * pipeline Live vì phần gọi API thật của subclass vốn đã độc lập với voice — chỉ khác là ở đây
   * `onDelta`/`onEvent` đi thẳng ra caller thay vì bị bridge nuốt vào hàng đợi TTS. */
  async sendTextMessage(
    userText: string,
    onDelta: (delta: string) => void,
    onEvent?: (event: AssistantStreamEvent) => void,
  ): Promise<void> {
    await this.fetchAssistantReply(userText, onDelta, onEvent);
  }

  /** Cho subclass "đọc to" 1 đoạn text KHÔNG gắn với 1 lượt hỏi-đáp cụ thể qua
   * `fetchAssistantReply`/`handleUserUtterance` (vd `RemoteTerminalConnector` muốn đọc output xuất
   * hiện do gõ tay trực tiếp vào terminal tương tác, hoặc từ tiến trình chạy nền — không phải trả
   * lời cho 1 câu hỏi vừa hỏi). Tạm dừng mic/STT trong lúc đọc, y hệt lý do `handleUserUtterance`
   * làm vậy — tránh bắt lại chính tiếng TTS đang phát rồi hiểu nhầm thành câu nói mới của người
   * dùng. Nối thẳng vào hàng đợi phát đã có sẵn — `drainSpeechQueue` tự `resumeListening()` khi
   * đọc xong, không cần subclass tự lo. */
  protected speak(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.closed) return;
    this.shouldListen = false;
    this.recognition?.stop();
    this.micVad?.pause();
    this.emit({ type: 'transcript-delta', role: 'model', text: trimmed });
    this.enqueueSpeech(sanitizeForSpeech(trimmed));
  }

  private enqueueSpeech(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const audio = this.config.ttsProvider === 'browser' ? null : this.fetchTtsAudio(trimmed);
    this.speechQueue.push({ text: trimmed, audio });
    if (!this.speaking) void this.drainSpeechQueue();
  }

  /** Phát lần lượt từng câu trong hàng đợi — audio (nếu có) đã được fetch song song từ lúc
   * enqueue nên `await item.audio` ở đây thường trả về ngay lập tức, không có khoảng lặng chờ
   * mạng giữa các câu. */
  private async drainSpeechQueue(): Promise<void> {
    if (this.speaking || this.closed) return;
    this.speaking = true;

    while (this.speechQueue.length > 0) {
      const item = this.speechQueue.shift();
      if (!item) break;
      this.emit({ type: 'state', value: 'speaking' });

      try {
        if (item.audio) {
          await this.playBlob(await item.audio);
        } else {
          await this.playBrowserUtterance(item.text);
        }
      } catch (err) {
        this.emit({
          type: 'error',
          message: err instanceof Error ? err.message : 'Không đọc được trả lời (TTS).',
        });
        return; // emit('error') đã đóng connector (xem useCallStore) — dừng hẳn, không phát tiếp
      }

      if (this.closed) return;
    }

    this.speaking = false;
    this.resumeListening();
  }

  /** TTS thật (OpenAI/Google) qua proxy server — key được đọc từ Settings phía server, không bao
   * giờ gửi tới đây. Gọi ngay lúc enqueue (không chờ tới lượt phát) để prefetch. */
  private async fetchTtsAudio(text: string): Promise<Blob> {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `TTS lỗi (HTTP ${res.status})`);
    }
    return res.blob();
  }

  /** Dùng LẠI đúng 1 phần tử `<audio>` singleton (xem `lib/unlock-audio-playback.ts`) thay vì tạo
   * `new Audio()` mỗi câu — Safari/iOS chỉ mở khoá autoplay cho phần tử được `.play()` lúc còn
   * trong user gesture; tạo phần tử mới sau đó mất hẳn trạng thái mở khoá (đã tái hiện thật: giọng
   * "Trình duyệt" nghe được, "OpenAI"/"Google" thì câm — đúng dấu hiệu của lỗi này). */
  private playBlob(blob: Blob): Promise<void> {
    return playAudioBlob(blob);
  }

  private playBrowserUtterance(text: string): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.config.language;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  private resumeListening(): void {
    if (this.closed) return;
    this.utteranceInFlight = false;
    this.shouldListen = true;
    this.emit({ type: 'state', value: 'listening' });
    try {
      this.recognition?.start();
    } catch {
      // Đã đang chạy — bỏ qua.
    }
    this.micVad?.start();
  }

  /** No-op: bridge tự bắt audio qua SpeechRecognition (managesOwnAudio), không nhận PCM chunk từ
   * MicCapture chung như UltronConnector. */
  sendAudioChunk(): void {}

  close(): void {
    this.closed = true;
    this.shouldListen = false;
    this.utteranceInFlight = true;
    this.pendingTranscript = '';
    this.speechQueue = [];
    this.speaking = false;
    window.speechSynthesis.cancel();
    pauseSharedAudio();
    this.recognition?.stop();
    this.recognition = null;
    this.micVad?.destroy();
    this.micVad = null;
    this.handlers.clear();
    this.onClose?.();
  }

  /** Hook cho subclass dọn tài nguyên riêng khi cuộc gọi kết thúc (vd TmuxAgentConnector giết
   * session tmux). Không bắt buộc override. */
  protected onClose?(): void;
}

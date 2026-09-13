import { pcm16ToFloat32 } from './pcm';

/** Playback streaming PCM16 chunk nối tiếp nhau (không khoảng hở/chồng lấp) — hỗ trợ barge-in
 * (`stop()` cắt ngay audio đang phát khi model bị ngắt lời). */
export class AudioPlayer {
  private context: AudioContext | null = null;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  start(sampleRate: number): void {
    this.context = new AudioContext({ sampleRate });
    this.nextPlayTime = 0;
  }

  playChunk(pcm: ArrayBuffer): void {
    const ctx = this.context;
    if (!ctx) return;
    const float32 = pcm16ToFloat32(pcm);
    const audioBuffer = ctx.createBuffer(1, float32.length, ctx.sampleRate);
    audioBuffer.copyToChannel(float32 as Float32Array<ArrayBuffer>, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    };

    const startAt = Math.max(this.nextPlayTime, ctx.currentTime);
    source.start(startAt);
    this.nextPlayTime = startAt + audioBuffer.duration;
    this.activeSources.push(source);
  }

  /** Cắt audio đang phát ngay lập tức (barge-in) — không đóng AudioContext, phiên vẫn tiếp tục. */
  interrupt(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Đã stop/kết thúc tự nhiên rồi — bỏ qua.
      }
    }
    this.activeSources = [];
    if (this.context) this.nextPlayTime = this.context.currentTime;
  }

  stop(): void {
    this.interrupt();
    this.context?.close();
    this.context = null;
  }
}

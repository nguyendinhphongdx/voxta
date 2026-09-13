/** Mic capture qua AudioWorklet — bắn PCM16 chunk (~128ms) qua callback. Caller lo việc gửi đi
 * đâu (WebSocket, hay bất kỳ transport nào connector khác dùng). */
export class MicCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;

  async start(sampleRate: number, onChunk: (pcm: ArrayBuffer) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const context = new AudioContext({ sampleRate });
    this.context = context;
    await context.audioWorklet.addModule('/audio/mic-worklet.js');

    const source = context.createMediaStreamSource(this.stream);
    const worklet = new AudioWorkletNode(context, 'mic-capture-processor');
    worklet.port.onmessage = (event: MessageEvent) => onChunk(event.data as ArrayBuffer);

    // Nối qua GainNode im lặng rồi mới ra destination — AudioWorkletNode chỉ được engine "kéo"
    // (process() chạy đều) khi nằm trong graph có đường tới destination; gain=0 để không phát lại
    // mic (tránh echo) nhưng vẫn giữ node "sống".
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    source.connect(worklet);
    worklet.connect(silentGain);
    silentGain.connect(context.destination);
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.context?.close();
    this.context = null;
  }
}

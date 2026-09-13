// AudioWorkletProcessor chạy trong audio rendering thread riêng — load bằng
// audioContext.audioWorklet.addModule('/audio/mic-worklet.js'), phải là URL tĩnh (không qua bundler).
// Input: Float32 samples ở sampleRate của AudioContext tạo ra nó — caller PHẢI tạo AudioContext
// đúng `inputSampleRate` của connector đang dùng để không cần tự resample ở đây.
class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    // ~128ms mỗi frame gửi lên main thread — đủ nhỏ để latency thấp, đủ lớn để không spam message.
    this._chunkSamples = 2048;
  }

  process(inputs) {
    const channelData = inputs[0] && inputs[0][0];
    if (channelData) {
      for (let i = 0; i < channelData.length; i++) {
        this._buffer.push(channelData[i]);
      }
      while (this._buffer.length >= this._chunkSamples) {
        const chunk = this._buffer.splice(0, this._chunkSamples);
        const pcm16 = new Int16Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          const s = Math.max(-1, Math.min(1, chunk[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('mic-capture-processor', MicCaptureProcessor);

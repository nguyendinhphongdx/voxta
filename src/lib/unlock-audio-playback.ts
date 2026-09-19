/** Safari/iOS chỉ "mở khoá" ĐÚNG CÁI PHẦN TỬ `<audio>` nào được `.play()` trong lúc còn nằm trong
 * user gesture (tap/click) — tạo `new Audio()` MỚI sau đó (như code cũ ở đây từng làm) không kế
 * thừa trạng thái mở khoá đó, mỗi instance mới lại bị chặn lại từ đầu. Đã tái hiện thật: người
 * dùng xác nhận giọng "Trình duyệt" (SpeechSynthesis) nghe được, nhưng "OpenAI"/"Google" (phát qua
 * `new Audio(blobUrl)` — xem `playBlob` trong `voice-text-bridge.ts`) thì câm — đúng dấu hiệu của
 * lỗi này, vì bản sửa trước chỉ mồi 1 `Audio` TẠM RỒI VỨT ĐI, không phải phần tử THẬT SỰ dùng để
 * phát TTS sau đó.
 *
 * Sửa: giữ ĐÚNG 1 phần tử `<audio>` singleton cho cả trang — mồi (unlock) nó trong gesture, rồi
 * dùng LẠI đúng phần tử đó (chỉ đổi `.src`) cho mọi lần phát TTS thật sau này, dù các lần đó không
 * còn nằm trong gesture nào nữa. Tương tự với `SpeechSynthesis.speak()` — không cần element riêng
 * nhưng cũng cần 1 lần gọi mồi trong gesture như cũ.
 */
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

let sharedAudioElement: HTMLAudioElement | null = null;

function getSharedAudioElement(): HTMLAudioElement {
  sharedAudioElement ??= new Audio();
  return sharedAudioElement;
}

/** Gọi ĐỒNG BỘ, ngay trong onClick của nút bắt đầu Live (trước khi `start()` bất đồng bộ chạy) —
 * bọc try/catch mọi bước vì trình duyệt không hỗ trợ (hoặc unlock thất bại) không được làm vỡ việc
 * bấm nút bắt đầu cuộc gọi, chỉ quay lại đúng hành vi cũ (im lặng trên mobile), không phải lỗi
 * chặn đường. */
export function unlockAudioPlayback(): void {
  try {
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  } catch {
    // SpeechSynthesis không khả dụng — bỏ qua, việc mở khoá <audio> ở bước dưới vẫn độc lập.
  }
  try {
    const audio = getSharedAudioElement();
    audio.src = SILENT_WAV_DATA_URI;
    audio.volume = 0;
    void audio.play().catch(() => {
      // Vẫn bị chặn (hiếm, thường do policy khác/lần đầu trang chưa tương tác gì) — không phải
      // lỗi cần báo ở BƯỚC MỒI này, `playAudioBlob` lúc phát TTS thật sẽ tự báo lỗi rõ ràng hơn
      // nếu vẫn không phát được.
    });
  } catch {
    // new Audio()/set src ném lỗi (rất hiếm) — bỏ qua tương tự.
  }
}

/** Phát 1 blob audio TTS thật (OpenAI/Google) — dùng LẠI đúng phần tử đã mở khoá ở
 * `unlockAudioPlayback()` (không tạo `Audio` mới, xem lý do ở comment đầu file). */
export function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = getSharedAudioElement();
    audio.volume = 1;
    audio.src = URL.createObjectURL(blob);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('Trình duyệt từ chối phát audio TTS.'));
    audio.play().catch((err: unknown) => {
      reject(err instanceof Error ? err : new Error('Trình duyệt từ chối phát audio TTS.'));
    });
  });
}

export function pauseSharedAudio(): void {
  sharedAudioElement?.pause();
}

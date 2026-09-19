/** Safari mobile (kể cả PWA standalone — đã xác nhận thật: web bình thường, PWA mobile thì câm dù
 * text vẫn trả về đúng) chỉ cho phép `SpeechSynthesis.speak()`/`HTMLAudioElement.play()` phát nếu
 * lệnh gọi bắt nguồn TRỰC TIẾP, ĐỒNG BỘ từ 1 user gesture (tap/click) — nhưng TTS thật của voxta
 * luôn phát ra SAU nhiều bước bất đồng bộ tính từ lúc bấm nút Live (mở mic/VAD → STT bắt được câu
 * nói → gọi backend → nhận trả lời → mới tới lượt phát), nên lúc `.speak()`/`.play()` thật sự được
 * gọi thì đã cách xa gesture gốc qua nhiều tick/await, bị trình duyệt âm thầm chặn (không throw
 * lỗi gì để log ra — im lặng đúng nghĩa).
 *
 * Gọi hàm này ĐỒNG BỘ, ngay trong onClick của nút bắt đầu Live (trước khi `start()` bất đồng bộ
 * chạy) — 1 lần phát "mồi" (âm lượng 0 / WAV câm) ngay trong gesture đó sẽ "mở khoá" khả năng phát
 * cho các lần `.speak()`/`.play()` bất đồng bộ tiếp theo trong cùng phiên trang, dù chúng không còn
 * nằm trong gesture nào nữa — cơ chế autoplay-unlock chuẩn cho Safari/iOS.
 *
 * Bọc try/catch mọi bước — trình duyệt không hỗ trợ (hoặc image lỗi lạ nào đó) không được làm vỡ
 * việc bấm nút bắt đầu cuộc gọi, unlock thất bại chỉ quay lại đúng hành vi cũ (im lặng trên mobile),
 * không phải lỗi chặn đường.
 */
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function unlockAudioPlayback(): void {
  try {
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  } catch {
    // SpeechSynthesis không khả dụng — bỏ qua, backend TTS thật (OpenAI/Google) vẫn được mở khoá
    // riêng ở bước dưới.
  }
  try {
    const audio = new Audio(SILENT_WAV_DATA_URI);
    audio.volume = 0;
    void audio.play().catch(() => {
      // Vẫn bị chặn (hiếm, thường do policy khác) — không phải lỗi cần báo, TTS thật sẽ tự báo
      // lỗi rõ ràng hơn nếu vẫn không phát được sau bước mở khoá này.
    });
  } catch {
    // new Audio() ném lỗi (rất hiếm) — bỏ qua tương tự.
  }
}

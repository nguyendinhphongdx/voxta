# @hanoilab/voxta

## 0.1.1

### Patch Changes

- 77403b4: Fix TTS bị câm trên mobile Safari/PWA (autoplay policy của WebKit chặn audio phát ra ngoài user gesture) — mở khoá audio playback ngay trong lúc bấm nút Live.
- 4c4eaf4: Hiện thông báo lỗi rõ ràng khi Live chạy trên Safari/WebKit (mọi trình duyệt trên iOS) — giải thích đây là giới hạn nền tảng (STT không hoạt động thật dù API tồn tại) thay vì mã lỗi kỹ thuật "not-allowed" khó hiểu, kèm gợi ý dùng chế độ gõ chat thay thế.
- 69d2e9a: Fix TTS OpenAI/Google câm trên Safari/iOS dù text vẫn trả về đúng (giọng "Trình duyệt" vẫn nghe được) — dùng lại đúng 1 phần tử `<audio>` đã mở khoá thay vì tạo mới mỗi câu, và báo lỗi rõ ràng nếu phát thất bại thay vì im lặng.

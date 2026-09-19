---
"@hanoilab/voxta": patch
---

Fix TTS OpenAI/Google câm trên Safari/iOS dù text vẫn trả về đúng (giọng "Trình duyệt" vẫn nghe được) — dùng lại đúng 1 phần tử `<audio>` đã mở khoá thay vì tạo mới mỗi câu, và báo lỗi rõ ràng nếu phát thất bại thay vì im lặng.

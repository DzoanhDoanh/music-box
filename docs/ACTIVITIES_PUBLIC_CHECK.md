# Giọng nói, vòng quay và menu — kiểm tra public

Phát hành: **16/11/2026, 20:40 giờ Việt Nam** (13:40 UTC).
URL: [roomtune.dzoanh.me](https://roomtune.dzoanh.me).
Commit tính năng: [3055794](https://github.com/DzoanhDoanh/music-box/commit/3055794d6ee5caf9cb6facf2a74179cb36dfc8c2).

## Bản phát hành

- Đưa đúng build đã thử nghiệm từ `.roomtune/game-build` sang `dist`.
  Main `index-C0BKs7RR.js`, wheel `LuckyWheel-CwvzpTg4.js`, CSS `LuckyWheel-CV9CKG-f.css`.
- Bật `VITE_ENABLE_WHEEL=true` và `ENABLE_WHEEL=true`; giữ cấu hình Ludo và dịch vụ hiện có.
- Giữ chunk cũ cho tab đang mở; kiểm tra **85 client artifacts PASS**.
  Chỉ khởi động lại preview: PID 45396 → 8764. Tunnel PID 23028 tiếp tục chạy.
- Bản cũ ở `.roomtune/releases/activities-20261116-204017/previous`; cấu hình trước phát hành
  và deployment pointer được lưu cùng thư mục release. Đây là dữ liệu vận hành riêng, không commit.
- Supabase dry-run trước phát hành không có migration còn thiếu; không chạy lại migration đã áp dụng.
  Public vẫn là runtime local qua tunnel, chưa deploy Cloudflare Workers production.

## HTTPS và dịch vụ thật

- Trang chủ, join/login, route trò chơi/vòng quay và health hoạt động; HTML và toàn bộ assets
  qua HTTPS khớp file phát hành. Header cho microphone ở same origin; CSP còn hiệu lực.
- API phòng/game/wheel không có phiên đăng nhập trả 401; Origin ngoài allowlist trả 403.
  Đường dẫn cấu hình, server source và debug trả 404.
- Hosted run `e2a07ce9-1979-4812-8a58-39216cd6b4ae` hoàn tất lúc 13:41:20 UTC: **4 nhóm PASS**.
  Auth/membership thật; thành viên quay lựa chọn tự nhập và hai phiên desktop/mobile nhận cùng kết quả.
  Phần thưởng TWO_FIRST bỏ qua biểu quyết đã bật, giữ active playback và toàn bộ hàng chờ;
  gửi lại cùng mã chỉ có một lượt, Next chọn đúng bài thưởng. Thu hồi thành viên chặn cả đọc và replay.
- Lượt xác minh ảnh `d307765b-35c5-4b62-8286-daff4358de30` lúc 13:43:35 UTC: **4 nhóm PASS**,
  dữ liệu tạm đã dọn. Chụp từ đầu trang để tránh lỗi vẽ phần tử fixed trong ảnh full-page khi đang
  cuộn; đã kiểm tra skip-link nằm ngoài viewport và xem ảnh mobile. Không đổi CSS sản phẩm.
- Đo tâm vòng quay có đường kính dưới 13% vòng ngoài, xác nhận bản thu nhỏ đã lên public.
  Hai tài khoản và phòng thử được dọn theo ID; không tác động phòng người dùng.
  Public build và deployment pointer không thay đổi trong kiểm thử.

Giới hạn: giọng nói đã qua kiểm thử sự kiện mô phỏng, chưa thử micro vật lý. Hosted kiểm tra
playback state/Next, không xác nhận âm thanh nghe được. Kết quả này không chứng minh đã sửa
báo cáo kéo bài làm mất các bài phía trước. Chi tiết sử dụng tại [ACTIVITIES.md](ACTIVITIES.md).

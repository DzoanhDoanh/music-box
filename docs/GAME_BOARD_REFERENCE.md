# Bàn cờ theo ảnh tham chiếu — 17/11/2026

Đã public lúc **11:26 ngày 17/11/2026 (giờ Việt Nam)** tại
[roomtune.dzoanh.me](https://roomtune.dzoanh.me). Bản thử local 5180 cũng đã cập nhật.
Commit triển khai: [e0a64f8](https://github.com/DzoanhDoanh/music-box/commit/e0a64f836b48a73784cd8398fed2872d155aef91),
đã push fast-forward lên `master` và `codex/voice-lucky-wheel`.

## Đối chiếu và sửa

Ảnh giao diện người dùng gửi có ô sao và mảng tam giác lớn giữa bàn: đó là bàn v1.
Bàn v2 đã phát hành vẫn dùng các ô vuông, chưa giống hình bàn cá ngựa thật được gửi kèm.

- Chuyển đường chung sang ô tròn có màu theo từng khu; bốn khu nhà chờ có vòng tròn lớn.
- Dãy chuồng là sáu ô vuông liên tiếp, đánh số 1–6 cho cả bàn cũ và mới. Thu nhỏ tâm bàn
  về một ô, không phủ lên bậc cuối như hình v1 trước đây.
- Ô xuất quân có hình ngựa; cửa chuồng có mũi tên vào dãy 1–6. Cửa nằm ngay trước ô xuất
  theo chiều đi. Chú giải được bổ sung trong Luật chơi.
- Căn lại tọa độ hiển thị của vòng v1 để ô cuối nối thẳng với bậc 1 và kế bên ô xuất.
  Không đổi chỉ số tiến độ đã lưu, thứ tự các vị trí, luật đi, kết quả, hay lịch sử ván.
- Bàn v1 giữ 52 vị trí và các ô an toàn theo luật cũ, biểu thị bằng viền chấm. Bàn v2 giữ
  56 vị trí, không có ô an toàn chung. Nhãn “BÀN LUẬT CŨ · 52 Ô” giúp nhận biết bàn đang mở;
  hướng dẫn tạo bàn mới nằm trong Luật chơi. Không tự chuyển bàn cũ sang luật v2.

## Kiểm chứng

- Typecheck và ESLint đạt; 61 test engine/chuyển động đạt, gồm cửa–xuất quân–bậc 1 cả bốn
  màu ở hai phiên bản. Không sửa engine hoặc migration trong lượt này.
- 6 kiểm thử browser desktop/mobile đạt: bàn v1/v2, đủ sáu bậc không bị che, bàn phím,
  chọn riêng đi/nhảy, theme sáng/tối, axe accessibility và ma trận viewport tới 320×568.
- Đã mở và xem ảnh [desktop v2](cangua-board-reference-desktop.png) và mobile v1 sáng;
  có thêm ảnh [mobile v2](cangua-board-reference-mobile.png).
- Build riêng `.roomtune/board-photo-build` đạt; scan 25 client artifacts đạt. Cảnh báo
  kích thước chunk chính và annotation Zod có từ trước, không chặn build.
- Trước phát hành, đã đổi riêng build thử 5180, giữ assets cũ, xác minh HTML phục vụ đúng build.
  Public `dist` không đổi qua build, HTML public và deployment pointer giữ nguyên qua restart.
  Không thao tác phòng/ván thật; không restart preview public hoặc tunnel.

## Phát hành public

- Đưa đúng build đã kiểm thử `.roomtune/board-photo-build` sang `dist`, giữ các assets cũ
  cho tab đang mở. Main `index-4EHXZG6b.js`, game `GameHub-C26acnXi.js`, CSS `GameHub-BTf1lEvn.css`.
- Scan 121 client artifacts đạt. Server bundle có SHA-256 giống bản public trước khi đổi;
  cấu hình và flags giữ nguyên. Supabase dry-run xác nhận không còn migration chờ, không
  áp dụng migration hoặc ghi dữ liệu ván thật trong đợt phát hành này.
- Preview PID 44272 → 3500; tunnel PID 23028 giữ nguyên. Build trước được lưu tại
  `.roomtune/releases/board-photo-20261117-112633/previous`, cùng bản sao cấu hình và
  deployment pointer riêng tư. Bản khôi phục này đã hỗ trợ cả luật v1/v2.
- Kiểm tra HTTPS đạt: HTML và toàn bộ assets khớp SHA-256 với bản phát hành; health hoạt
  động, header bảo vệ giữ nguyên, API không đăng nhập trả 401, Origin ngoài allowlist trả
  403, đường dẫn cấu hình/source/debug trả 404.
- Hosted run hoàn tất **04:28:31 UTC: 9 nhóm PASS**, chi tiết tại
  [GAME_PUBLIC_CHECK.md](GAME_PUBLIC_CHECK.md). Hai phiên desktop/mobile tạo/vào bàn, tung
  xúc xắc, đi quân, đồng bộ, retry receipt và khôi phục sau mất mạng đều đạt. Hàng chờ và
  playback của phòng thử giữ nguyên; quyền RLS/API/private Realtime được kiểm tra.
- Đã mở và xem ảnh chụp bản public trên desktop/mobile, xác nhận ô tròn và dãy 1–6.
  Ba tài khoản và phòng thử đã được dọn theo đúng ID của lượt chạy. Không dùng thiết bị
  vật lý và không xác nhận âm thanh YouTube trong kiểm thử này.

Để xem: tải lại trang public hoặc trang thử. Bàn đang mở cũng nhận hình mới; muốn dùng luật
v2 thì tạo bàn mới. Máy Windows vẫn cần chạy để phục vụ public qua Cloudflare Tunnel.

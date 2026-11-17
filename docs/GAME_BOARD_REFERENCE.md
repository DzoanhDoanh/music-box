# Bàn cờ theo ảnh tham chiếu — 17/11/2026

Đã cập nhật source và bản thử local tại http://127.0.0.1:5180. Chưa commit/push hoặc
đưa thay đổi hình bàn này lên public. Bản public tiếp tục dùng release `92a195d`.

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
- Đã đổi riêng build thử 5180, giữ assets cũ, xác minh HTML đang phục vụ đúng build mới.
  Public `dist` không đổi qua build, HTML public và deployment pointer giữ nguyên qua restart.
  Không thao tác phòng/ván thật; không restart preview public hoặc tunnel.

Để xem: tải lại trang thử. Bàn đang mở cũng nhận hình mới; muốn dùng luật v2 thì tạo bàn mới.

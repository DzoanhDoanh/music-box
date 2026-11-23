# Dễ dùng hơn: phòng nhạc, màn chọn trò chơi, Bầu Cua và Đua Vịt — 23/11/2026

## Phạm vi

### Phòng nhạc

- Sao chép lời mời có đường dự phòng khi trình duyệt chặn Clipboard API (HTTP/LAN,
  trình duyệt trong app); hộp "Mời bạn bè" có Sao chép liên kết, Sao chép mã và Chia sẻ.
- Form vào phòng nhận cả liên kết mời được dán vào, tự viết hoa mã, tự đặt con trỏ.
- Hàng chờ: tên bài hiện 2 dòng trên điện thoại; nút ♥ hiện trạng thái đã yêu thích
  và bấm lại để bỏ; xóa bài của mình có "Thêm lại" trong thông báo, xóa bài người khác
  cần xác nhận.
- Lịch sử phát: lọc theo cả tên kênh, báo khi không có kết quả, ẩn phân trang thừa.
- Thẻ "Đang trong phòng" gọn hơn trên điện thoại; chừa chỗ cho nút chat/giao diện nổi.
- Form tạo phòng có gợi ý cho mô tả và PIN.

### Màn chọn trò chơi

- Một lưới thống nhất cho Đua Vịt, Bầu Cua và Cờ cá ngựa: màu riêng, số người chơi,
  thời lượng và nút hành động rõ ràng. Khối giới thiệu cờ cá ngựa thu gọn thành thanh
  Tạo bàn mới / Quân của tôi. Bỏ thanh cuộn lồng trong sảnh.

### Bầu Cua

- Vòng bị hủy không còn hiện xúc xắc, ô "thắng" và cược cũ; có thông báo đã hoàn coin.
- Chip theo đúng giới hạn bàn; ô cược bị khóa có lý do (ngoài mức, thiếu coin, chạm
  giới hạn người/bàn). Nút Hoàn ghi rõ số coin hoàn.
- Kết quả vòng trước vẫn hiện trong vòng mới (autoNext) và nằm trên bảng cược.
- Lý do đang chờ (tạm dừng, chưa có cái, đếm ngược); nút Lắc/Mở bát hiện thời gian chờ.
- Migration `202611230001_bau_cua_cancel_pause.sql`: hủy vòng khi đã yêu cầu "Tạm dừng
  sau vòng" sẽ dừng bàn ngay thay vì chạy thêm một vòng.
- Một phản hồi thông báo lỗi không còn làm sập cả trang phòng.

### Đua Vịt

- Host được chuyển quyền (không phải chủ phòng) không thể bắt đầu hoặc đua lại cuộc
  đua có thưởng coin; người bị mời ra vẫn bị chặn khi đua lại.
- Không lộ người thắng trước khi vịt về đích trên màn hình.
- Người chơi thấy "Cuộc đua tiếp theo đã mở" sau khi host bấm Đua lại / Vòng kế tiếp.
- Chế độ 2D trên điện thoại có bảng dẫn đầu thu gọn; "Vịt của tôi" cuộn tới làn của bạn.
- Danh sách tên dán vào được dùng ngay khi tạo; bài đã phát không làm kẹt form; lỗi
  nhập liệu bằng tiếng Việt thay vì JSON; xác nhận trước khi chuyển quyền host; bớt
  thông báo thừa.

## Kiểm chứng

- TypeScript, ESLint, Prettier và `vite build` đạt.
- 504 unit/API test đạt (thêm 2 test thưởng coin Đua Vịt).
- Database thật cục bộ: Bầu Cua 30/30 (thêm ca hủy khi chờ tạm dừng), Đua Vịt 10/10.
- Browser: phòng 94/94, Bầu Cua 13/13, Đua Vịt 26/26, Cờ cá ngựa 101 đạt.
  Hai ca cờ cá ngựa (`capture bursts at impact` desktop, `skin preference is used…`
  mobile) vẫn lỗi cả khi tắt màn chọn trò chơi mới; chưa xác định nguyên nhân.

## Phát hành

Bản build mới đang chạy tại https://roomtune.dzoanh.me (preview 4173 đã khởi động lại).
Migration `202611230001` cần chạy `npm.cmd run db:migrate` trên dự án Supabase đã link.

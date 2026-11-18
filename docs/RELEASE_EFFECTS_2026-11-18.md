# Long quyền, Rider Kick và Kamehameha — 18/11/2026

## Phạm vi

- Long quyền: rồng ngọc theo đòn đánh, xung kích và K/O.
- Rider Kick: quân tạm biến thành Kamen Rider, bật lên tung cú đá rồi trở lại
  mẫu quân đã chọn.
- Kamehameha: quân biến thành Goku, tụ khí và bắn chưởng trước khi phục hồi
  mẫu quân tại ô đã được máy chủ xác nhận.
- Xem thử/phát lại/dừng và áp dụng hiệu ứng, lưu theo tài khoản/thiết bị.
  Đây là tùy chọn hiển thị cục bộ, không phải trang bị được đồng bộ cho cả phòng.
- Đồng hồ hoạt ảnh tính đủ thời gian thực khi FPS thấp, bỏ khoảng chờ trước
  khung hình đầu để bàn đứng yên lâu không làm bỏ qua đòn đánh.

Không đổi luật, dữ liệu ván, quyền, API hoặc database schema. Mặc định bàn
phẳng, camera, chế độ Nhẹ, reduced motion và WebGL fallback được giữ nguyên.

## Kiểm chứng và candidate

- 20 ca browser desktop/mobile đạt cho cả bốn hiệu ứng, persistence,
  va chạm/phục hồi, snapshot trùng, ngắt hoạt ảnh, WebGL và duy trì nhạc.
  Dùng phòng fixture, không thao tác ván của người dùng.
- 12 unit test quỹ đạo/đồng hồ đạt; TypeScript, ESLint và định dạng đạt.
- Build riêng `scripts/build-bau-cua.mjs` đạt; public `dist`, trial 5180 và
  con trỏ deploy giữ nguyên khi build. 35 client artifacts qua scan heuristic.
- Candidate đã chạy trên 5181, health `configured`, HTML và 34 asset mới khớp
  từng byte, bốn đường dẫn nội bộ không trả cấu hình bí mật.

Candidate: `.roomtune/releases/bau-cua-20261118T072846/candidate`.
Client `index-D-jcEe8a.js`, scene `LudoScene-D6Rv2RJ0.js`, CSS `game-B76KUyGC.css`.

Người dùng đã yêu cầu commit và public. Chuyển runtime web 4173, giữ tunnel
và các bản thử, giữ chunk cũ cho tab còn mở và lưu bản trước để rollback.
Không chạy migration hoặc sửa ván. Trước chuyển, một ván cờ ở trạng thái
PAUSED, không có lượt Bầu Cua đang chạy.

## Kết quả phát hành

Đã chuyển public lúc **07:40:11 UTC (14:40:11 giờ Việt Nam), 18/11/2026**.
Commit ứng dụng `3294646e16896b5fb1fbdecc2997e3ed8ce830c9` đã push lên
`origin/master` và `origin/codex/voice-lucky-wheel` bằng cập nhật atomic,
không force push.

Health public `configured`; HTML và toàn bộ asset mới tại runtime 4173
khớp candidate. Tunnel, danh tính và HTML của cả hai bản thử 5180/5181,
cùng con trỏ deploy được giữ nguyên. Bản public trước nằm tại
`.roomtune/releases/bau-cua-20261118T072846/previous` để khôi phục.
16 kiểm tra HTTPS/routes/quyền/đường dẫn nội bộ đã đạt.
Không chạy migration, không reset hoặc cập nhật ván.

## Sử dụng

Tại [ROOMTUNE](https://roomtune.dzoanh.me), tải lại trang rồi mở
**Cờ cá ngựa → Bàn 3D → Thử hiệu ứng**, chọn hiệu ứng và bấm **Xem thử**
hoặc **Dùng …**. Xem thử dùng quân mẫu, không thay đổi ván thật.

Chưa đo FPS/audio trên điện thoại vật lý hoặc kiểm tra tải lớn.

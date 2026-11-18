# Bố cục bàn cờ, góc nhìn 3D và kết liễu trực tiếp — 18/11/2026

## Phạm vi

- Khung bàn cao hơn; danh sách bốn ghế chuyển xuống dưới điều khiển lượt ở
  cột phải. Điện thoại và màn hình thấp mở danh sách bằng nút Người chơi.
- Vào Bàn 3D và đặt lại góc nhìn: hướng thẳng (yaw 0°), nghiêng 45°, zoom
  120%. Giới hạn nghiêng 45° tránh làm bàn quá dẹt; vẫn kéo xoay/zoom được.
- K/O và Long quyền lao thẳng từ ô đang đứng tới đối thủ. Rider Kick và
  Kamehameha tiếp tục biến hình và tấn công từ ô xuất phát của đòn đánh.
- Giữ thao tác chọn ghế, đổi màu, sẵn sàng và quyền mời rời bàn; giữ mặc định
  bàn phẳng cho thiết bị chưa lưu lựa chọn, reduced motion và WebGL fallback.

Không thay luật, kết quả, API, database schema hoặc dữ liệu ván đang chơi.

## Kiểm chứng

- 20 unit test quỹ đạo trực tiếp, quỹ đạo nền, đồng hồ, Rider và Kamehameha đạt.
- 24 ca browser desktop/mobile cho hiệu ứng trực tiếp và hồi quy hiệu ứng đạt.
- 20 ca browser bố cục/camera/thao tác bàn/quản lý ghế và duy trì nhạc đạt;
  hai ca ma trận/GPU lặp được bỏ qua có chủ đích.
- Tinh chỉnh góc mặc định đã qua bốn ca desktop/mobile; tăng zoom 120% đã
  qua hai ca desktop/mobile về kéo/zoom, reset và bấm đích bắt quân.
- Đã xem ảnh desktop/mobile; TypeScript, lint, định dạng và build riêng đạt.
  Browser dùng ván fixture, không thao tác ván của người dùng.
- Build `scripts/build-bau-cua.mjs` giữ nguyên public và 5180; 35 client
  artifacts qua scan heuristic. Bản thử 5181 có health `configured`, HTML
  và 34 asset mới khớp từng byte; bốn kiểm tra đường dẫn nội bộ đạt.

Candidate: `.roomtune/releases/bau-cua-20261118T084848/candidate`.
Client `index-BGBfoKwr.js`, scene `LudoScene-NHrmQA25.js`, hub
`GameHub-Bw7Y0rJE.js`, CSS `game-CSbOyeeG.css`.

## Phát hành

Người dùng đã yêu cầu commit, push và public. Candidate đã sẵn sàng;
kết quả chuyển public sẽ được ghi sau khi kiểm tra runtime và HTTPS.
Giữ tunnel, hai bản thử và chunk cũ cho tab còn mở; lưu bản public trước
để rollback. Không chạy migration hoặc sửa ván.

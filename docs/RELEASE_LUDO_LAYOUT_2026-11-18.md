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

Đã chuyển public lúc **08:53:35 UTC (15:53:35 giờ Việt Nam), 18/11/2026**.
Commit ứng dụng `0c5344629e4532a517190c182c876238cda2cb02` đã push atomic
lên `origin/master` và `origin/codex/voice-lucky-wheel`, không force push.

Health public `configured`; HTML và 34 asset mới tại runtime 4173 khớp
candidate. Tunnel, danh tính/HTML của cả hai bản thử 5180/5181 và con trỏ
deploy giữ nguyên. Bản public trước được lưu tại
`.roomtune/releases/bau-cua-20261118T084848/previous` để rollback.
16 kiểm tra HTTPS/routes/quyền/đường dẫn nội bộ đạt; toàn bộ 309 asset
(gồm chunk cũ) tải qua tên miền khớp từng byte, Origin bên ngoài bị từ chối.
Trước chuyển không có ván cờ PLAYING/PAUSED hoặc lượt Bầu Cua chưa kết thúc.
Không chạy migration, không reset hoặc cập nhật ván.

Tải lại [ROOMTUNE](https://roomtune.dzoanh.me) để nhận bố cục mới, rồi chọn
**Cờ cá ngựa → Bàn 3D**. Góc mặc định và nút đặt lại cùng dùng zoom 120%.

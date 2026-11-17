# Chọn hình quân cá nhân — 17/11/2026

Đã public lúc **16:10 ngày 17/11/2026 (giờ Việt Nam)** tại [ROOMTUNE](https://roomtune.dzoanh.me),
đồng thời cập nhật bản thử 5180. Source được gộp trong đợt phát hành
[luật cố định lúc 19:47](CANGUA_FIXED_MOVEMENT.md). Cùng đợt 16:10 có bản sửa
đếm bước/tự nhảy mô tả trong [CANGUA_MOVEMENT_UPDATE.md](CANGUA_MOVEMENT_UPDATE.md).
Xem [thông tin phát hành](PIECE_SKINS_RELEASE.md).

## Cách dùng trong bản mới

- Ở danh sách bàn: chọn **Quân của tôi** để chọn hình mặc định cho lần tạo bàn hoặc ngồi
  ghế tiếp theo trên thiết bị đang dùng.
- Khi đã có ghế: vào **Tùy chọn bàn → Quân của tôi**, chọn mẫu, xem trước cả bốn quân,
  rồi **Lưu hình quân**. Hình được lưu trong bàn và đồng bộ cho mọi người xem.
- 16 lựa chọn: Siêu nhân, Anh hùng mặt nạ, Robot, Ninja; Ngựa, Mèo, Chó, Thỏ, Chim, Cá,
  Rùa; Tên lửa, Vương miện, Kim cương, Ma nhỏ, Ngôi sao. Nhóm siêu anh hùng có dáng chibi
  riêng, với áo choàng, mũ giáp, thân robot hoặc khăn ninja. Dùng SVG nội bộ, không cần
  tải ảnh ngoài hay thêm thư viện.
- Một người chọn một mẫu cho cả bốn quân, giữ màu đội và số thứ tự. Có thể đổi khi bàn
  đang chờ, đã sẵn sàng, đang chơi hoặc tạm dừng. Chỉ người còn tham gia được đổi quân
  của chính mình; người xem, người đã đầu hàng/hoàn thành và bàn đã kết thúc không đổi.
- Đổi hình không làm thay đổi vị trí, luật, xúc xắc, thời hạn, lượt hiện tại hoặc sẵn sàng.
  Chơi lại giữ hình đã chọn. Ván cũ chưa có lựa chọn vẫn hiển thị Ngựa.
- Hình của bàn được lưu trên server, giữ khi tải lại và thấy từ thiết bị khác. Lựa chọn
  mặc định cho bàn tiếp theo lưu theo người dùng trong trình duyệt, chưa phải hồ sơ chung
  giữa mọi thiết bị. Lưu mặc định thất bại được báo lỗi; lưu hình trong bàn vẫn có hiệu lực
  nếu trình duyệt chặn localStorage.
- Hộp chọn có phần danh sách cuộn riêng; nút đóng/lưu luôn hiện, kể cả màn hình 320×568
  hoặc điện thoại xoay ngang. Hỗ trợ sáng/tối, bàn phím và tên quân cho trình đọc màn hình.

## Dữ liệu và phát hành

`players[].skin` là enum tùy chọn, dùng chung danh mục TypeScript/Zod ở client và server.
Vắng trường này nghĩa là Ngựa, không tự ghi thêm vào ván cũ. Lệnh đổi hình có version,
receipt chống lặp và dùng xác thực, quyền thành viên, Realtime riêng hiện có. Server chỉ
đổi người ngồi ghế tương ứng actor đăng nhập; client không truyền người chơi mục tiêu.

Migration `202611170005_piece_skins.sql` mở validator cho trường hình quân của cả schema
1 và 2, giữ hỗ trợ `rules.movement`. Không sửa dữ liệu đã lưu, lịch sử hoặc migration cũ.

Đã áp dụng **004 (movement) rồi 005 (piece skins)** trước runtime mới. Hai migration này
đã được áp dụng hosted, không sửa lại nội dung. Người dùng tải lại các tab cũ sau phát hành.
Không rollback runtime về bản chưa đọc được các trường mới sau khi đã sử dụng.
Build kiểm tra tại `.roomtune/piece-skins-build` đã được chuyển sang `dist`; chỉ thư mục
`client` là tài nguyên công khai, không phục vụ thư mục worker.

## Kiểm chứng

- 417 unit/API tests trong 39 tệp đạt; bao phủ ván cũ, 12 lựa chọn, schema đầu vào,
  quyền sở hữu, ván kết thúc, giữ luật/nước đi, chơi lại, localStorage lỗi và sai dữ liệu.
  Sau khi thêm bốn mẫu siêu anh hùng, chạy lại 30 test liên quan đạt, bao phủ danh mục
  16 mẫu, engine và API.
- 87 nhóm kiểm thử PostgreSQL cô lập đạt, gồm validator, create/join, CAS, retry,
  membership bị thu hồi và kết quả/rematch. Không dùng phòng thật để thử.
- Regression trình duyệt: 46 đạt, 2 mobile skips có chủ đích vì trùng ma trận desktop.
  Sau sửa giao diện picker, 7 ca chuyên biệt đạt, 1 skip mobile do ma trận viewport chạy
  một lần trên desktop Chromium. Bao phủ đồng bộ hai người, mất phản hồi/tải lại, mặc định
  create/join, người xem, màu quân trong portal và nút lưu không bị khuất.
- Sau bổ sung siêu anh hùng: 9 browser tests đạt, 1 skip mobile có chủ đích. Kiểm tra cả
  bốn dáng, số quân, màu đội, lưu/tải lại và đi quân Siêu nhân. 87 nhóm PostgreSQL chạy lại
  đạt, gồm danh mục đầy đủ cho cả schema 1 và 2.
- Đã xem ảnh desktop/mobile sáng/tối, bàn có Mèo/Tên lửa và bốn mẫu siêu anh hùng,
  hộp chọn ở 320×568, 844×390; axe WCAG A/AA cho hộp chọn không báo vi phạm.
- Typecheck, lint, định dạng, `git diff --check` và build riêng đều đạt. Entry cuối:
  `index-DchVD37T.js`, game `GameHub-hivG5IAb.js`, CSS `GameHub-DIfz4ynk.css`.
  Quét 26 client artifacts không thấy mẫu server secret (kiểm tra heuristic).
  Trong lúc build, hash `dist` và con trỏ deploy giữ nguyên. Khi được yêu cầu public,
  chỉ restart preview 4173 và bản thử; tunnel giữ nguyên. Cảnh báo chunk chính trên
  500 kB và chú thích Zod vẫn có như bản trước.

Fixture trình duyệt dùng cổng 5175, PostgreSQL cô lập dùng cổng 55439. Public/trial dùng
Supabase hosted; kết quả kiểm thử thực tế sau phát hành ghi ở [GAME_PUBLIC_CHECK.md](GAME_PUBLIC_CHECK.md).

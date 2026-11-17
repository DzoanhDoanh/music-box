# Bộ luật di chuyển cố định — 17/11/2026

Đã public lúc **19:47 ngày 17/11/2026 (giờ Việt Nam)** tại
[ROOMTUNE](https://roomtune.dzoanh.me). Bản thử `http://127.0.0.1:5180` đã cập nhật
cùng build. Đợt này gồm luật cố định, [sửa vùng bấm](CANGUA_INTERACTION_FIX.md) và
toàn bộ phần [chọn hình quân](PIECE_SKINS.md) đã phát hành trước đó.

## Quy tắc

- Người chơi chọn quân; hệ thống quyết định nước đi riêng cho quân ấy khi ra 1.
  Đường tới cửa kế tiếp và cửa đích trống thì bắt buộc nhảy. Nếu bị cản thì xét một
  bước hợp lệ. Không có lựa chọn đi thường thay cho nhảy, hoặc nhảy xuyên vật cản.
- Quân mình và quân đối thủ trên ô thường đều cản đường nhảy. Đi một bước chỉ đá khi
  đích là quân đối thủ; đích có quân mình thì quân đang chọn không có nước đi.
- Bỏ qua các ô xuất quân khi đếm bước, dù trống hay có quân. Quân đứng ở đó không
  cản đường, không bị đá. Chỉ thao tác ra quân từ nơi chờ (`-1 → 0`) được đặt quân
  vào ô xuất quân cùng màu. Mỗi ô tối đa một quân; đang có quân thì không xuất thêm.
- Quân đã ra không quay lại ô xuất quân của mình: dừng ở cửa cuối, lần tung sau
  vào chuồng. Giữ quy tắc số chính xác để lên các bậc trong chuồng.

Ví dụ cùng lượt ra 1: quân số 1 ở ô 2 bị quân mình tại cửa 13 cản thì đi tới 3;
quân số 2 ở cửa 13 có đường thoáng thì nhảy tới 27. Quân xanh ở ô xuất quân 14 không
cản quân số 2. Giao diện chỉ có hai nút theo số quân với kết quả tương ứng.

## Áp dụng và tương thích

Bàn mới mặc định dùng `movement: SPAWN_ONLY_AUTO_JUMP`, bắt buộc `safe: STARTS` và
`jumpOnOne: true`. Bỏ hai tùy chọn tắt an toàn/tắt nhảy ở giao diện luật mới. Zod/API
và CHECK PostgreSQL đều từ chối tổ hợp trái quy tắc; không chỉ ẩn nút ở frontend.

Các bàn đã lưu giữ nguyên luật, vị trí, lịch sử và receipt, gồm v1, v2 không marker
và `SKIP_STARTS_AUTO_JUMP` cho phép tùy chỉnh trước đó. Có nhãn “Bàn dùng luật đã lưu”.
Chủ bàn nâng luật qua **Tùy chọn bàn → Tùy chỉnh luật → Áp dụng luật di chuyển mới →
Lưu luật chơi** khi đang chờ, kể cả sau Chơi lại. Nâng luật giữ thời gian lượt/điều
kiện xuất quân, bật đúng hai quy tắc bắt buộc và đặt lại trạng thái sẵn sàng. Không
thay luật giữa ván đang chơi/tạm dừng.

## Phát hành

- Migration mới `202611170006_fixed_cangua_movement.sql` chỉ mở validator cho profile
  cố định, không ghi lại dữ liệu. Giữ nguyên identity hàm CHECK và trigger cấm sửa
  luật giữa ván. Migration 004/005 đã áp dụng được giữ nguyên từng byte.
- Đã áp dụng 006 vào project `zhcnyadfkpszgdmesxvi` trước khi chạy runtime/client mới;
  dry-run sau đó xác nhận database up-to-date, không còn migration đang chờ.
- Backup trước migration: `backups/before-fixed-movement-2026-11-17T12-44-48-535Z.dump`,
  675.371 bytes. `pg_restore --list` đọc được archive và có dữ liệu phòng; không
  restore vào hosted.
- Build riêng tại `.roomtune/fixed-movement-build`; helper giữ hash `dist` và khôi
  phục `.wrangler/deploy/config.json`. Chỉ thư mục `client` là tài nguyên trình duyệt.
  Sau kiểm tra mới chuyển build sang `dist`, giữ lại assets hash cũ cho tab đang mở.
- Preview 4173 và bản thử 5180 đã restart; tunnel ROOMTUNE giữ nguyên, không deploy
  Worker production. Bản public cũ lưu ở
  `.roomtune/releases/fixed-movement-20261117-194754/previous`, bản thử cũ lưu ở
  `previous-game-trial-build` cùng thư mục. Sau khi có bàn dùng profile mới, chỉ sửa
  tiếp bằng runtime tương thích, không quay lại bản chưa đọc được profile này.
- Tải lại tab để nhận client mới. Bàn đang chơi giữ luật đã lưu; chủ bàn nâng luật
  khi trở về trạng thái chờ theo đường dẫn ở phần trên.

## Kiểm tra

- **424/424 unit/API đạt**. Có kiểm tra cả bốn màu, hệ thống tự chọn hai loại nước
  khác nhau trong cùng lượt, từ chối client ép STEP/JUMP sai, xuất quân bị chặn,
  không đi vòng về ô xuất quân, mọi mặt 2–6 bỏ qua ô xuất quân và đọc luật cũ.
- **88 nhóm PostgreSQL cô lập đạt**, gồm migration thật, CHECK đối với profile mới,
  từ chối vị trí trên ô xuất màu khác, tương thích profile cũ, retry/CAS, giữ luật
  đang chơi, nâng khi chờ, lịch sử và backup/restore. Cluster thử đã dừng.
- Typecheck/lint/định dạng/diff check đạt. Browser kiểm tra phòng fixture riêng ở
  5175, không dùng phòng của người dùng.
- Browser: **27 đạt, 1 bỏ qua có chủ đích** (luồng đủ ván bốn người đã chạy ở
  desktop). Đã xem ảnh desktop/mobile của cùng lượt có một quân chỉ đi 1 và một quân
  bắt buộc nhảy. Không xuất hiện menu lựa chọn STEP/JUMP trong profile cố định.
- Build `index-BezJGTqD.js`, `GameHub-DlqDb80L.js`, `GameHub-BYt101AS.css` thành công;
  quét 26 client artifacts không thấy mẫu khóa server. Cảnh báo chunk trên 500 kB
  và chú thích Zod có sẵn vẫn còn.
- Sau phát hành: HTTPS trả đúng HTML và toàn bộ assets khớp hash release; 198 client
  artifacts gồm các bản hash cũ qua kiểm tra mẫu secret. Health configured; API chưa
  đăng nhập trả 401, Origin ngoài allowlist trả 403; đường dẫn cấu hình/source/debug
  trả 404.
- [10 nhóm kiểm tra hosted](GAME_PUBLIC_CHECK.md) đạt lúc 19:50: đăng nhập/tham gia
  phòng, tạo bàn profile cố định, đồng bộ hình quân, kênh riêng tư, tung xúc xắc và
  đi quân thật, retry, mất mạng/tải lại và thu hồi quyền. Queue/playback/version nhạc
  không đổi. Phòng và tài khoản của lượt thử đã được dọn đúng ID; đã xem ảnh desktop
  và mobile sau kiểm tra. Không dùng phòng thật của người dùng để thử.

Kiểm tra hosted dùng hai browser contexts với Auth/PostgreSQL/Realtime thật, không
phải hai thiết bị vật lý. Không kiểm tra âm thanh YouTube hoặc cron production.

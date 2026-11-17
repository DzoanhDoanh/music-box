# Phát hành hình quân và luật di chuyển — 17/11/2026

Public lúc **16:10 (giờ Việt Nam)** tại [ROOMTUNE](https://roomtune.dzoanh.me).
Bản thử `http://127.0.0.1:5180` được cập nhật cùng build để dùng chung database tương thích.
Source tại thời điểm phát hành là working tree sau `43c3311`, sau đó được gộp trong
đợt [luật cố định và sửa vùng bấm lúc 19:47](CANGUA_FIXED_MOVEMENT.md).

## Thay đổi và cách dùng

- **Tùy chọn bàn → Quân của tôi → chọn hình → Lưu hình quân**. 16 mẫu chia nhóm Siêu
  anh hùng, Động vật và Biểu tượng. Bốn mẫu mới là Siêu nhân áo choàng, Anh hùng mặt nạ,
  Robot và Ninja. Mỗi người đổi riêng cả bốn quân, giữ màu đội/số quân; mọi người cùng
  bàn thấy thay đổi và tải lại vẫn giữ lựa chọn.
- Danh sách bàn có **Quân của tôi** để đặt hình mặc định trên thiết bị cho lần tạo/vào
  ghế tiếp theo. Đây chưa phải tùy chọn tài khoản đồng bộ giữa các thiết bị.
- Bàn mới bỏ qua ô xuất quân an toàn của màu khác khi đếm bước. Ra 1 tự nhảy nếu đường
  thoáng; bị cản thì xét đi một bước hợp lệ. Bàn cũ giữ luật đã lưu. Chủ bàn muốn nâng
  luật: lúc chờ, **Tùy chọn bàn → Tùy chỉnh luật → Áp dụng luật di chuyển mới → Lưu**.
  Ván đang chơi không tự đổi luật.
- Tải lại các tab đang mở để nhận client mới. Chi tiết ở [hình quân](PIECE_SKINS.md)
  và [luật di chuyển](CANGUA_MOVEMENT_UPDATE.md).

## Database và runtime

- Backup: `backups/before-piece-skins-movement-2026-11-17T09-07-52-079Z.dump`,
  685.757 bytes, archive được `pg_restore --list` đọc và xác nhận chứa dữ liệu phòng.
  Không restore archive vào hosted.
- Đã dry-run, áp dụng theo thứ tự `202611170004_cangua_movement.sql` và
  `202611170005_piece_skins.sql` vào project `zhcnyadfkpszgdmesxvi`. Dry-run sau phát hành
  báo up-to-date. Không viết lại ván, tọa độ, lịch sử hoặc receipt đã có.
- Build `.roomtune/piece-skins-build` chuyển sang `dist`. Entry `index-DchVD37T.js`,
  game `GameHub-hivG5IAb.js`, CSS `GameHub-DIfz4ynk.css`. Giữ các assets hash cũ cho tab
  đang mở; chỉ `client` được phục vụ, không phục vụ worker hoặc cấu hình bí mật.
- Chỉ restart preview 4173 và bản thử 5180; tunnel ROOMTUNE giữ nguyên. Không deploy
  Worker production. Cấu hình và deployment pointer giữ nguyên.
- Bản cũ lưu ở `.roomtune/releases/piece-skins-20261117-161025/previous`, bản thử cũ ở
  `previous-game-trial-build` cùng thư mục. Không rollback về runtime chưa đọc được
  `skin`/`movement` sau khi có ván sử dụng các trường này; sửa tiếp bằng bản tương thích.

## Xác minh

- Nền 417 unit/API tests đạt; sau thêm bốn mẫu, 30 test liên quan chạy lại đạt.
  PostgreSQL cô lập: 87 nhóm đạt với danh mục 16 mẫu cho cả schema 1 và 2.
- Regression browser trước nhóm siêu anh hùng: 46 đạt, 2 skips có chủ đích. Sau bổ sung:
  9 ca chọn quân đạt, 1 skip mobile trùng ma trận viewport desktop. Đã xem ảnh thực tế
  sáng/tối, desktop/mobile và bốn mẫu trên bàn cờ. Hộp chọn không báo lỗi axe WCAG A/AA.
- Typecheck, lint, format và build đạt. 26 client artifacts của build mới và 179 artifacts
  của release có giữ assets cũ qua kiểm tra mẫu secret; đây là scan heuristic.
- HTTPS trả đúng HTML; toàn bộ 179 assets khớp hash release. Health configured;
  API không đăng nhập trả 401, Origin ngoài allowlist trả 403, đường dẫn source/cấu hình
  và debug trả 404.
- [10 nhóm kiểm tra hosted](GAME_PUBLIC_CHECK.md) đạt: login/join desktop/mobile,
  tạo bàn luật mới, kênh riêng tư, chọn Siêu nhân/Ninja đồng bộ, retry giữ nguyên trạng
  thái, xúc xắc và nước đi thật, mất mạng/tải lại, thu hồi quyền. Queue/playback/version
  nhạc trong phòng thử không thay đổi. Chỉ tạo và dọn đúng phòng/tài khoản của lượt thử.

Kiểm thử hosted dùng hai browser contexts với Auth/PostgreSQL/Realtime thật, không phải
hai thiết bị vật lý. Không kiểm tra âm thanh YouTube hoặc cron production trong đợt này.

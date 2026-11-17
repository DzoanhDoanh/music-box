# Cờ cá ngựa v2 — kiểm tra public

Phát hành lúc **11:06 ngày 17/11/2026, giờ Việt Nam** (04:06 UTC).
URL: [roomtune.dzoanh.me](https://roomtune.dzoanh.me).
Commit triển khai: [66f8053](https://github.com/DzoanhDoanh/music-box/commit/66f80537ca439ad2c8e210ea11ca8047b592d046).
Đã push fast-forward đồng thời lên `master` và `codex/voice-lucky-wheel`.

## Thay đổi và cách dùng

- Bàn mới dùng schema 2 / CANGUA_V2: chặn quân giữa đường, đá đúng số bước, lựa chọn nhảy
  khi ra 1, cửa chuồng là ô cuối vòng và ô xuất quân nằm ngay sau cửa, sáu bậc chuồng riêng.
- Tải lại trang rồi chọn **Giải trí → Trò chơi → Tạo bàn mới** trên desktop hoặc
  **Thêm → Trò chơi → Tạo bàn mới** trên mobile.
- Ván cũ và lịch sử giữ schema/luật v1, kể cả khi chơi lại. Không chuyển vị trí quân trong
  ván cũ sang cách hiểu v2. Xem [bộ luật](GAME_RULES_V2.md) và [kiểm thử source](GAME_RULES_AUDIT.md).

## Migration và runtime

- Backup trước migration: `backups/before-cangua-v2-2026-11-17T04-03-51-217Z.dump`,
  682.487 bytes. Archive bao gồm public/private/auth/migrations; `pg_restore --list` đọc
  được và có dữ liệu phòng. Không restore backup này vào hosted.
- Dry-run chỉ liệt kê `202611170001_cangua_v2.sql`; đã áp dụng thành công vào project
  `zhcnyadfkpszgdmesxvi`. Dry-run sau phát hành xác nhận không còn migration chờ.
- Đưa đúng build đã kiểm thử `.roomtune/cangua-v2-build` sang `dist`:
  main `index-DVAXYZF1.js`, game `GameHub-DuSctslK.js`, CSS `GameHub-C7lvgvkS.css`.
- Giữ assets cũ cho tab đang mở; scan **103 client artifacts PASS**. Đây là kiểm tra
  heuristic dấu hiệu secrets, không phải một cuộc kiểm toán secrets đầy đủ.
- Preview đổi từ PID 8764 sang 44272; tunnel PID 23028 giữ nguyên. Các giá trị cấu hình,
  flags game/wheel và deployment pointer được giữ nguyên.
- Bản thử 5180 cũ đã dừng sau khi xác minh PID/path/start time/command line, cập nhật cùng
  build v2 rồi bật lại (PID 3312). Không để runtime chỉ hiểu v1 vận hành bàn v2.
- Bản public cũ tại `.roomtune/releases/activities-20261117-110641/previous`; build thử cũ
  tại `previous-game-trial-build` trong cùng thư mục. Cấu hình và dữ liệu vận hành được
  lưu riêng, không commit. Khi đã có bàn v2, **không rollback mù về server chỉ hiểu v1**;
  cần runtime tương thích v1/v2 hoặc bản sửa tiếp theo, giữ migration và dữ liệu đã lưu.

## Xác minh public

- Trang chủ, join/login, lobby/match/wheel và health trả 200 qua DNS/HTTPS bình thường.
  HTML và toàn bộ assets public khớp file phát hành theo SHA-256; CSP và header microphone
  còn hiệu lực. API không đăng nhập trả 401, Origin ngoài allowlist trả 403.
  Cấu hình, server source và debug endpoint trả 404.
- Hosted run hoàn tất lúc **04:09:15 UTC: 9 nhóm PASS**. Chi tiết tự sinh tại
  [GAME_PUBLIC_CHECK.md](GAME_PUBLIC_CHECK.md). Hai browser contexts desktop/mobile dùng
  Auth, PostgreSQL và private Realtime thật; kiểm tra menu đã gộp, tạo bàn schema 2,
  56 ô chung, 24 bậc chuồng, đúng chỉ số cửa và xuất quân cả bốn màu.
- Tung xúc xắc từ server và đi quân qua UI thành công; retry receipt giữ nguyên kết quả;
  mất mạng/reload khôi phục đúng trạng thái. Outsider, ghi trực tiếp, RPC service và
  broadcast giả bị chặn; thu hồi thành viên chặn cả API và nối lại kênh.
- Hàng chờ/playback/version nhạc của phòng thử không đổi. Ba tài khoản và phòng kiểm thử
  đã được dọn theo đúng ID của lượt chạy; không thao tác phòng người dùng.
- Đã mở và kiểm tra ảnh desktop/mobile chụp từ bản public. Build và deployment pointer
  không bị thay đổi bởi kiểm thử hosted.

Giới hạn: kiểm thử hosted không chạy hết ván bằng xúc xắc thật, không dùng hai thiết bị vật lý
và không xác nhận âm thanh YouTube. Mô phỏng ván đầy đủ, chặn/đá/nhảy/vào chuồng và tương thích
v1 đã kiểm tra ở engine, PostgreSQL local và browser fixture. Public vẫn chạy trên máy Windows
qua Cloudflare Tunnel; chưa deploy Worker production hoặc cron phút.

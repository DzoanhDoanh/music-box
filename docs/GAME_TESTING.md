# Kiểm chứng cờ cá ngựa — 14/11/2026

Đây là bằng chứng lịch sử của bản thử riêng ngày 14/11. Bản phát hành sau đó được kiểm tra
riêng tại [GAME_PUBLIC_CHECK.md](GAME_PUBLIC_CHECK.md); các mô tả chưa public bên dưới phản ánh thời điểm kiểm thử này.

Phạm vi: source local trên nhánh `master`, sau mốc nhạc `6db62b4`. Chưa commit phần game,
migration game đã áp dụng cho bản thử riêng, chưa public game hoặc deploy Worker.
Kết quả hosted mới được ghi riêng tại [GAME_HOSTED_CHECK.md](GAME_HOSTED_CHECK.md).

Bản thử riêng chạy tại `http://127.0.0.1:5180`, chỉ bind loopback. Smoke hosted đã đạt:
đăng nhập email, thành viên ẩn danh vào phòng có PIN, tạo bàn/ngồi ghế/sẵn sàng/tung/đi quân,
receipt replay không đổi kết quả, private Broadcast, từ chối outsider/direct-write/forged Broadcast,
mất mạng/tải lại giữ ván, thu hồi membership và public game API vẫn 404. Hai browser contexts dùng
dịch vụ thật; không phải hai thiết bị vật lý. Mọi tài khoản/phòng của test đã được dọn.

Launcher riêng đã được kiểm tra Stop/Start/Status. Preview PID 43024 và tunnel PID 10976 giữ nguyên
thời điểm chạy. Kiểm tra HTTP các đường dẫn `.dev.vars`/config không trả secret; client scan đạt 20
artifacts. Không refresh public, không sửa shared `.env`/`.dev.vars`. Backup trước migration gồm
public/private/Auth/migration history đã tạo dạng archive và kiểm tra đọc danh mục; chưa restore hosted.

## Kết quả

| Nhóm                 | Bằng chứng                                                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine               | 27 ca: mọi mặt xúc xắc, biến thể luật, đá/chồng/ô an toàn, exact finish, hạng, ba lần 6, timeout, pause, membership, toàn ván deterministic                                                                                                                                              |
| Auth/API/service     | Strict schemas chặn dice/actor/board giả, actor đã xác minh, membership, version, receipt không sinh die mới, CSPRNG rejection sampling; flags/cron mặc định tắt                                                                                                                         |
| React/recovery       | Pending command giữ key/body/version qua reload; response cũ không ảnh hưởng bàn/tài khoản mới; cache không hạ version; denied snapshot bị ẩn; không gửi khi lưu receipt thất bại                                                                                                        |
| PostgreSQL 17 cô lập | **54 kiểm tra đạt**, gồm toàn bộ kiểm tra nhạc/chat và game migration, schema JSON sai/null/type, RLS và forged Broadcast, concurrent seats/roll/move, receipts, revoked replay, ranked member departure, cron timeout/results/rematch, playback/queue/version không đổi, backup/restore |
| Game Playwright      | **11 đạt, 1 bỏ qua có chủ đích**: full game 4 browser contexts + rematch chạy ở desktop; mobile có các ca UI/reload/keyboard/music riêng                                                                                                                                                 |
| Giao diện game       | Axe WCAG 2 A/AA trên `.game-hub` không có vi phạm ở dark/light, desktop/mobile; reduced motion, luật/Escape, keyboard move, xác nhận đầu hàng. Hai ca giao diện chạy lại đạt sau tinh chỉnh cuối                                                                                         |
| Regression nhạc      | **10 ca đạt** trên desktop/mobile: game ẩn ở cấu hình thường kể cả URL `?game=...`, không request API game, chat retry/moderation, biểu quyết, owner/member host recovery                                                                                                                |
| IFrame               | Game suite xác minh **cùng DOM IFrame** cho host và listener khi đổi game/search/queue; game không phát lệnh điều khiển nhạc                                                                                                                                                             |
| Build tách biệt      | `npm.cmd run build:game` đạt; hash mọi file `dist` không đổi và con trỏ deploy được giữ; output nằm trong `.roomtune/game-build`                                                                                                                                                         |
| Secret scan          | 20 client artifacts không có server-secret marker/known key format; đây là kiểm tra heuristic                                                                                                                                                                                            |

Lượt cuối unit/API/React toàn dự án: **232/232 đạt, 22 files**. Typecheck, lint (không warning)
và format check đạt. `git diff --check` không có lỗi whitespace. Vite có warning chunk lớn của
SPA và annotation của dependency Zod; build vẫn hoàn tất, không xem đó là bằng chứng về CPU production.

## Phân biệt fixture và dịch vụ thật

- Database tests dùng PostgreSQL thật và migration thật, gọi engine/service thật qua adapter cùng
  ánh xạ lỗi RPC production. Supabase-managed Auth/Realtime schemas được fixture; không chứng minh
  hành vi của hosted Auth gateway hoặc hệ thống Realtime thật.
- Browser test tạo bốn context độc lập, tự chọn ghế/sẵn sàng và bấm UI qua toàn bộ ván tới rematch.
  Backend browser fixture dùng cùng engine và chuỗi dice deterministic **chỉ trong tests**.
  Code production không có endpoint hoặc biến môi trường để chọn die.
- Reconnect/missed events được kiểm tra bằng transport fixture + polling; không gọi đây là hosted
  multi-device verification. IFrame YouTube được fixture và không kiểm chứng âm thanh vật lý.
- Khôi phục receipt dùng `sessionStorage` cùng tab, không hứa lưu outbox sau khi đóng hẳn tab.
  Trạng thái ván/die vẫn ở DB; truy cập lại lấy snapshot authoritative.

## Ảnh đã kiểm tra

- [Desktop dark](game-desktop-dark-fixture.png), [desktop light](game-desktop-light-fixture.png)
- [Mobile dark](game-mobile-dark-fixture.png), [mobile light](game-mobile-light-fixture.png)

Ảnh chỉ chứa người/phòng giả của suite; không dùng AE CTV hoặc Nhạc của Doanh.

## Trước khi phát hành thật

Theo yêu cầu người dùng, phần này **chưa thực hiện**: thực nghiệm bốn thiết bị vật lý,
test nhiều mạng thật và quota/CPU production,
cron Cloudflare được deploy, rollback/restore hosted. Quy trình chuẩn bị có trong [GAME.md](GAME.md).
Không suy kết quả fixtures hoặc smoke hosted thành bảo đảm production hoặc bài kiểm thử tải dài hạn.

Public giữ assets nhạc `index-CmyD6DfW.js`, `index-D_Xl_i4L.css`; build game không ghi vào `dist`,
không restart preview và không dừng tunnel. Cả frontend và API Ludo đều opt-in.
Kiểm tra HTTP local preview ở cổng 4173 sau build: 200, vẫn trả hai assets cũ; health `configured`,
YouTube configured. Không dùng kết quả local này để khẳng định đã kiểm thử game trên domain public.

## Cập nhật màn chơi riêng — 14/11/2026

- Unit/API/React: **236 ca / 23 files đạt**, thêm kiểm tra đường đi qua từng góc,
  ra quân/về đích, quân bị đá, bỏ qua duplicate/missed versions/rematch khi diễn hoạt.
- Game browser: **18 ca riêng biệt đạt qua lượt đầy đủ và các lượt kiểm tra lại phần sửa**;
  2 ca lặp ở mobile được bỏ qua có chủ đích (ván 4 người và ma trận viewport chạy ở desktop).
  Kiểm thử bàn phím chờ `aria-disabled=false` sau kết quả tung trước khi gửi Enter/Space;
  không dựa vào thời gian trả lời API. Ván 4 người chạy đến FINISHED và rematch thành công.
- Ma trận viewport: 1366×768, 1024×768, 390×844, 320×568, 844×390.
  Bàn và nút chọn quân nằm trong viewport, không tràn ngang; Back/lời mời cũ hoạt động.
- Host và listener giữ nguyên DOM iframe khi chuyển sảnh/bàn/tìm bài/hàng chờ.
  Player ở màn chơi luôn có viewport tối thiểu 200×200; Space chọn quân không dừng nhạc.
- Chat nhận đúng phòng từ đường dẫn bàn, mở/đóng không đẩy bàn hoặc che nút hành động.
- Axe WCAG 2 A/AA cho dark/light desktop/mobile không báo vi phạm;
  reduced motion và tải lại hiển thị ngay trạng thái commit, không chạy lại nước đi.
- Bộ hồi quy phòng nhạc: **82 đạt, 2 bỏ qua có chủ đích** trong lượt chạy đầy đủ,
  gồm session/token expiry, phát nhạc, queue, chat, biểu quyết, host recovery và Ludo vẫn ẩn.
- Typecheck/lint đạt. Không thay đổi luật server hoặc migration; không chạy lại hosted
  smoke/database suite cho đợt chỉ sửa UI này. Kết quả hosted ở trên thuộc lượt thử trước.

Ảnh màn chơi mới: [desktop](game-dedicated-desktop-fixture.png),
[mobile](game-dedicated-mobile-fixture.png). Dữ liệu và YouTube trong ảnh là fixture.

Build riêng sau cập nhật đạt; kiểm tra 20 client artifacts không thấy server-secret marker.
Bản thử đã restart ở 127.0.0.1:5180 (PID 25624), HTTP health `configured`, đang phục vụ
`index-CrR2RFDU.js` và chunk `GameHub-2e0ijsbF.js`. Public vẫn dùng `index-CmyD6DfW.js`,
preview PID 43024 và tunnel PID 10976 giữ nguyên danh tính/thời điểm khởi động;
con trỏ deploy vẫn là `dist/roomtune/wrangler.json`. Không public hoặc commit game.

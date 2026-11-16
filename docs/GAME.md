# Cờ cá ngựa ROOMTUNE

Tính năng phát hành tại **https://roomtune.dzoanh.me** cùng các chức năng nghe nhạc.
Trong phòng, chọn **Trò chơi → Tạo bàn mới**. Cả giao diện và API được bật qua hai flags
`VITE_ENABLE_LUDO=true` và `ENABLE_LUDO=true`. Xem [kiểm thử public](GAME_PUBLIC_CHECK.md).
Migration `202611140004_ludo.sql` đã áp dụng ngày 14/11/2026 sau backup và dry-run.
Không sửa các migration đã áp dụng. Chưa deploy Worker production hoặc cron phút;
deadline vẫn được xử lý khi có lượt đọc/lệnh, gồm polling khi đang mở bàn.

## Mở bản chơi thử trên máy này

```powershell
Set-Location D:\Projects\MusicBox
npm.cmd run game:start
```

Mở **http://127.0.0.1:5180/login**, đăng nhập tài khoản chủ phòng hiện có. Trong phòng,
chọn **Trò chơi → Tạo bàn mới**. Để tự thử hai người, mở cửa sổ ẩn danh vào cùng địa chỉ,
chọn vào phòng bằng mã/PIN với tên khác, rồi ngồi ghế trống. Hai tab thường dùng chung
tài khoản nên không đại diện cho hai người. Mỗi người cần bấm sẵn sàng trước khi bắt đầu.

`game:status` xem trạng thái, `game:stop` chỉ tắt bản thử. Ván lưu trong Supabase thật và
có thể vào lại sau khi bật. Script dùng cửa sổ ẩn và kiểm tra PID/executable/thời điểm chạy/
command line trước khi dừng. Cấu hình và log nằm trong `.roomtune/game-trial` được Git bỏ qua.

Địa chỉ này **chỉ mở trên máy chạy dự án**, chưa truy cập từ điện thoại/máy khác. Không có
tunnel riêng hoặc đổi route của tunnel đang public. Bản thử dùng cùng tài khoản/database
hosted: nên dùng phòng thử riêng; thao tác nhạc/chat trong phòng cũ vẫn tác động phòng đó.
Frontend được phục vụ từ `.roomtune/game-build/client`, tuyệt đối không serve thư mục worker
hoặc `.dev.vars`. Khi cập nhật source: `game:stop`, `build:game`, rồi `game:start`.

Đây là dịch vụ chạy thật, không phải fixture ở cổng 5175. Xem [GAME_HOSTED_CHECK.md](GAME_HOSTED_CHECK.md)
để biết kết quả kiểm thử Auth/PostgreSQL/private Realtime thực tế.

## Cách chơi khi tính năng được bật

1. Trong phòng nhạc, chọn **Trò chơi → Tạo bàn mới**, đặt tên và luật. Bàn chỉ dành cho
   thành viên cùng phòng; không cần tài khoản game riêng.
2. Bấm **Ngồi đây** để chọn màu. Mỗi người bấm **Tôi đã sẵn sàng**. Từ 2 đến 4 người,
   quản trò bấm **Bắt đầu ván**. Có thể đổi sang ghế trống trước khi bắt đầu.
3. Khi đến lượt, **Tung xúc xắc**, rồi chọn ngựa có vòng sáng hoặc nút **Ngựa 1–4**.
   Tab và Enter/Space cũng chọn được ngựa hợp lệ. Số nhỏ trên quân và biểu tượng cạnh tên
   phân biệt người chơi, không chỉ dựa vào màu.
4. **Mời vào bàn** sao chép đường dẫn. Người được mời cần có quyền vào phòng; đường dẫn
   không cấp quyền hoặc bỏ qua PIN. Có thể vào xem như khán giả mà không chiếm ghế.
5. Đổi tab tìm bài/chat vẫn giữ ghế và ván; nếu đến lượt khi đang ở tab khác sẽ có thông báo.
   **Danh sách bàn** chỉ đóng bàn đang xem. **Rời ghế** dành cho lobby; trong ván,
   **Đầu hàng** có hộp xác nhận. Đóng trang không đồng nghĩa đầu hàng ngay.
6. Quản trò hoặc owner/moderator có thể tạm dừng/tiếp tục. Sau kết thúc, **Chơi lại** giữ màu
   của người còn là thành viên nhưng yêu cầu từng người sẵn sàng lại. Kết quả cũ vẫn lưu.

Quản trò của bàn khác với host nhạc. Thành viên tạo bàn không có thêm quyền quản lý nhạc.
Game không tạo YouTube player, không sửa queue/âm lượng/lease. Chế độ nghe trên mọi thiết bị
vẫn cần người nghe chủ động bật như trước. Hiệu ứng game là âm ngắn, mặc định tắt và bật riêng.

## Luật Ludo ROOMTUNE v1

Mỗi người có 4 quân, đường chung 52 ô và đường về đích riêng 6 ô. Vị trí trong dữ liệu là
`-1` trong nhà, `0–51` trên đường chung, `52–57` trên đường đích; `57` là đích cuối.
Đây là bộ luật Ludo đã chọn cho sản phẩm, không trộn quy tắc xếp chuồng 6–5–4–3 của biến thể khác.

| Quy tắc            | Mặc định                                                | Tùy chọn trước ván                               |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------ |
| Ra quân            | Tung 6, đặt vào ô xuất phát                             | Tung 1 hoặc 6                                    |
| Ô an toàn          | Ô xuất phát và ô sao                                    | Chỉ xuất phát / không có                         |
| Đá quân            | Đáp xuống ô không an toàn đá mọi quân đối phương ở ô đó | Không đổi                                        |
| Chồng quân         | Được chồng; không tạo hàng rào                          | Không đổi                                        |
| Thêm lượt          | Tung 6                                                  | Thêm thưởng khi đá quân và/hoặc một quân về đích |
| Ba lần 6 liên tiếp | Lần thứ ba mất lượt trước khi đi                        | Có thể tắt                                       |
| Về đích            | Cần đúng số; không đi quá 57                            | Không đổi                                        |
| Thời gian          | 45 giây cho cả tung và chọn quân                        | 30 / 45 / 60 / 90 giây                           |
| Bỏ lượt            | 3 lượt vắng liên tiếp thì đầu hàng                      | 2–5 lượt                                         |

Không có nước hợp lệ thì tự xử lý chuyển lượt/thêm lượt theo mặt xúc xắc. Đủ 4 quân về đích
được xếp hạng, ván tiếp tục đến khi chỉ còn một người chưa xếp hạng. Người đó nhận hạng còn lại;
không bắt họ tự di chuyển hết quân. Người đầu hàng đứng sau những người còn chơi; ai đầu hàng
trước xếp thấp hơn. Kết quả phân biệt rõ đầu hàng với hoàn thành.

Deadline được lưu trong database. Khi hết giờ, lượt bị bỏ và xúc xắc chưa đi không được tung lại.
Một lượt có thao tác hợp lệ đặt lại bộ đếm vắng. Tạm dừng giữ nguyên xúc xắc và thời gian còn lại.
Người bị kick/ban mất quyền đọc/gửi lệnh; quân đang chơi được xử lý đầu hàng lần đồng bộ kế tiếp.
Người đã xếp hạng rời phòng không chặn những người còn lại; rematch loại ghế không còn quyền vào phòng.

## Khôi phục và lỗi

- Realtime báo version đã commit; trình duyệt lấy snapshot đầy đủ, không áp dụng state từ Broadcast.
  Mất sự kiện có polling 5 giây; online/đổi visibility/reconnect cũng đồng bộ lại.
- Thao tác lưu mã yêu cầu, nội dung và version vào `sessionStorage` **trước khi gửi**. Khi mạng lỗi,
  **Xác minh thao tác** gửi lại đúng mã cũ để lấy kết quả cũ. Tải lại cùng tab vẫn khôi phục được.
- Nếu tạo bàn chưa nhận phản hồi, lobby có **Khôi phục bàn vừa tạo**, tránh tạo hai bàn.
- Outbox tách theo tài khoản/phòng/bàn/tab, không chứa token. Đóng hẳn tab hoặc xóa storage mất
  outbox của tab đó, nhưng mở lại bàn vẫn lấy trạng thái server; không tự tung lại xúc xắc đã có.
- Sai lượt hoặc version cũ: tải snapshot mới rồi thao tác lại. Không tự chuyển một lệnh cũ sang lượt mới.
- Trình duyệt chặn storage: game không gửi mutation cho đến khi lưu được mã khôi phục.

## Kiến trúc và API

`src/shared/game/engine.ts` thuần TypeScript, nhận thời gian và die từ trusted service.
`GameService` dùng `crypto.getRandomValues` với rejection sampling (loại byte 252–255),
không có tùy chọn test dice trong API production.

| Endpoint sau `/api/v1/rooms/:room` | Nội dung                                                     |
| ---------------------------------- | ------------------------------------------------------------ |
| `GET /games?page=0`                | 20 bàn/trang, cả bàn đã kết thúc                             |
| `POST /games`                      | `{name, rules}`; bắt buộc `Idempotency-Key` UUID             |
| `GET /games/:game`                 | Snapshot, serverNow, khán giả hiện diện, 20 kết quả gần nhất |
| `POST /games/:game`                | Lệnh strict và receipt key                                   |

Lệnh có `version`: `join/color` kèm `color:0..3`, `ready` kèm boolean, `settings` kèm rules,
`move` kèm `piece:0..3`, hoặc `start/roll/leave/surrender/pause/resume/cancel/rematch`.
`watch/unwatch` không có version, chỉ cập nhật hiện diện, không đổi ván hay tung xúc xắc.
Không nhận actor, điểm đến, dice hoặc board từ client.

SQL lưu `game_matches`, `game_players`, `game_settings`, `game_moves`, `game_events`, `game_results`,
`game_spectators`; receipt nằm trong schema private. JSON có schema/version và kiểm tra trường,
kiểu, null, enum, quân/rank/deadline. Commit lock phòng rồi lock bàn, kiểm tra membership và receipt,
so sánh version (CAS), ghi state/move/event/result và broadcast trong cùng transaction.
Xung đột không tạo lần tung mới; receipt được giữ suốt đời bàn, không bị maintenance 7 ngày xóa.

RLS cho thành viên phòng đọc; direct client write và RPC commit bị chặn. Worker service role mới
được gọi RPC, và RPC vẫn kiểm tra actor/membership/ban. Role manager được kiểm tra lại khi commit.
Kênh `game:<uuid>` riêng tư và chỉ nhận; broadcast chỉ mang version nên kênh cũ không lộ board
sau khi bị thu hồi quyền. Các sự kiện đã commit gồm created/player_joined/player_left/started/
dice_rolled/piece_moved/turn_changed/finished/state_updated. Reconnect là sự kiện transport ở client
để refetch, không ghi một nước đi giả vào lịch sử.

Giới hạn: 8 bàn chưa kết thúc/phòng, 6 lần tạo/người/giờ, cộng rate limit Auth chung 180 request
và 90 mutation/phút/người. Lịch sử trả về có giới hạn, toàn bộ kết quả vẫn nằm trong DB.

## Kiểm thử và build an toàn cho public

```powershell
npm.cmd test
npm.cmd run test:db
npm.cmd run test:e2e:game
npm.cmd run build:game
node.exe scripts/check-client-secrets.mjs .roomtune/game-build/client
npm.cmd run test:hosted:game -- --project-ref zhcnyadfkpszgdmesxvi
```

`test:db` dùng cluster PostgreSQL tạm tại cổng 55439; `test:e2e:game` dùng browser fixture trên
cổng 5175. Chúng không dùng phòng/tài khoản thật. Chạy các suite trình duyệt lần lượt.
`build:game` bật UI trong bản build kiểm thử `.roomtune/game-build`, kiểm tra hash `dist` không đổi
và khôi phục con trỏ deploy Wrangler sau build. Để cập nhật bản public, dùng quy trình trong
[TUNNEL.md](TUNNEL.md). Kiểm thử HTTPS bằng lệnh sau chỉ tạo/dọn dữ liệu của chính lượt chạy:

```powershell
npm.cmd run test:hosted:game -- --project-ref zhcnyadfkpszgdmesxvi --base-url https://roomtune.dzoanh.me
```

Chỉ thư mục `client` chứa static assets. Thư mục worker build có bản sao `.dev.vars` do plugin
tạo; không chia sẻ/serve/package cả thư mục build. Build không bật API hay tự migrate database.

## Cấu hình phát hành và rollback

1. Migration game đã được áp dụng cho bản thử riêng; không chạy lại hoặc sửa migration đã apply.
   Backup trước migration nằm trong `backups/` được Git bỏ qua; archive đã kiểm tra đọc danh mục,
   chưa restore hosted. Không reset database. Mọi migration tiếp theo cần backup/dry-run tương ứng.
2. Giữ Realtime public access tắt. Test tự động chỉ dùng phòng/tài khoản do lượt chạy tạo.
   Chưa kiểm thử tải trên bốn thiết bị vật lý hoặc phục hồi backup trên hosted.
3. Bật **cả** `VITE_ENABLE_LUDO=true` lúc build và `ENABLE_LUDO=true` ở runtime trên target được phép.
   Không có cờ hoặc false thì navigation không hiện, API game trả 404 sau Auth.
4. Khi deploy Worker được cho phép, bổ sung `* * * * *` vào crons cùng lịch maintenance hiện có.
   Cron gọi `settleDueGames` với tối đa 6 bàn/lần để giới hạn số request, mỗi bàn có tối đa 3 lần CAS;
   local preview/tunnel không có production cron. Khi chưa có cron,
   lần đọc/lệnh kế tiếp vẫn xử lý các deadline đã lưu; các bàn không ai mở chỉ bắt kịp khi có truy cập.
5. Build/secret scan, khởi động preview/tunnel, rồi smoke test qua HTTPS. Không tạo tài nguyên
   trả phí. GitHub Actions chạy kiểm tra, không tự phát hành lên máy cá nhân hoặc Workers.

Rollback bằng cách tắt flags và quay về bản nhạc trước; không drop bảng trong lúc còn cần khôi phục
ván/receipt. Nhạc và game không dùng chung version, queue hoặc host lease.

## Màn chơi riêng và hiệu ứng (14/11/2026)

- Phòng nhạc → **Trò chơi** mở sảnh `/room/:id/games`; mỗi bàn có địa chỉ
  `/room/:id/games/:match`. Lời mời cũ `?game=...` tự chuyển sang địa chỉ mới.
- **Về phòng nhạc** giữ ghế, ván và máy phát hiện tại. **Danh sách bàn** quay về sảnh.
  Nút Back của trình duyệt cũng dùng được. Đầu hàng luôn là thao tác riêng có xác nhận.
- Desktop đặt xúc xắc/nước đi cạnh bàn; mobile dành vùng dưới bàn cho nút tung/chọn quân.
  Bàn co theo cả chiều rộng và chiều cao. Màn hình rất thấp hoặc người dùng phóng to chữ
  vẫn có thể cần cuộn; không khóa zoom hoặc cắt nội dung để ép vừa.
- **Tùy chọn bàn** chứa mời bạn, bật/tắt âm game, góc nhìn nổi/thẳng, tạm dừng, đầu hàng
  và lịch sử. Chat và đổi theme nằm trên thanh đầu màn hình; toast tránh cụm điều khiển.
- Máy phát YouTube đang chạy giữ **cùng DOM iframe**, hiển thị tối thiểu 200×200; mobile
  dành một vùng riêng cho nó. Muốn bật nghe lần đầu hoặc chọn bài, quay về phòng nhạc.
- Xúc xắc là khối sáu mặt bằng CSS 3D; bàn/quân dùng SVG có đổ bóng và góc nghiêng nhẹ
  trên desktop. Đây không phải toàn bộ bàn được dựng bằng WebGL. Dùng Web Animations API
  cho quân nhảy từng ô, quân bị đá quay về và hiệu ứng đích; không thêm dependency/runtime nặng.
- Chỉ diễn hoạt nước đi đã commit liên tiếp, không sinh xúc xắc client hay trì hoãn lệnh game.
  Reload, đổi bàn, rematch, thiếu phiên bản và duplicate receipt không diễn lại đường đi cũ.
  Chuyển tab nền hoặc bật reduced motion hủy hiệu ứng và hiện ngay trạng thái máy chủ.
- Space khi thao tác bàn cờ không kích hoạt phím tắt dừng nhạc của host.

Màn chơi và hiệu ứng được đưa vào bản public cùng game. Không thay đổi các migration đã áp dụng.

# Cờ cá ngựa online — kế hoạch triển khai

Ngày 14/11/2026. Mở rộng repository hiện tại; MusicBox được miễn PMP. Mốc trước game: `6db62b4`.

**Cập nhật 16/11/2026:** người dùng đã yêu cầu public toàn bộ game và đẩy mã nguồn lên GitHub.
Phần giới hạn bản thử bên dưới là kế hoạch lịch sử ngày 14/11, đã được thay thế bởi
[hướng dẫn phát hành hiện tại](GAME.md) và [kết quả kiểm thử HTTPS](GAME_PUBLIC_CHECK.md).

**Chơi thử riêng, chưa public theo yêu cầu mới nhất.** Giữ nguyên `dist` và preview public;
không refresh preview hoặc deploy Worker. Migration Ludo đã áp dụng lên hosted sau backup/dry-run
để bản riêng `127.0.0.1:5180` dùng Auth/PostgreSQL/Realtime thật. Build nằm trong `.roomtune/game-build`.

## Điểm tích hợp đã kiểm tra

- React RoomPage giữ HostPlayer/ListenerPlayer bên ngoài nội dung tab. Thêm tab Trò chơi;
  game không tạo YouTube player, không điều khiển queue/âm lượng và không tháo player khi đổi tab.
- Auth API xác minh Supabase identity trên mọi request; cache theo room + actor. Game dùng cùng
  membership/ban. Không tạo identity mới hoặc tin vai trò do trình duyệt gửi.
- Hono gọi Supabase qua service role; private RPC kiểm tra membership trước receipt. Bổ sung
  migration mới, không sửa bảy migration đã áp dụng. Chưa tự deploy Worker hoặc tạo dịch vụ mới.
- Realtime private room channel đang dùng chung cho nhạc/chat. Game có topic `game:<uuid>` riêng,
  receive-only cho thành viên phòng. Broadcast chỉ mang version/event đã commit; client fetch snapshot.

## Luật mặc định

Ludo ROOMTUNE v1: 2–4 người, 4 quân/người, đường chung 52 ô, đường về đích riêng 6 ô.
Ra quân bằng 6; cần số chính xác để về đích. Ô bắt đầu và ô sao an toàn. Cho phép chồng quân,
không tạo hàng rào. Đến ô không an toàn thì đá toàn bộ quân đối thủ trên ô đó. Tung 6 được thêm
lượt; lần 6 thứ ba liên tiếp mất lượt trước khi đi. Không thưởng lượt khi đá/về đích mặc định.
Người về đủ bốn quân có thứ hạng; chơi tiếp đến khi còn một người. Đầu hàng xếp sau người về đích.

Cấu hình trước ván: ra quân 6 hoặc 1/6; ô an toàn sao/ô xuất phát/không; thưởng lượt khi đá hoặc
về đích; bật/tắt ba lần 6; thời gian 30/45/60/90 giây; 2–5 lượt vắng liên tiếp trước đầu hàng.
Hết giờ mất lượt (không tự tung lại hoặc chọn quân); deadline lưu DB. PAUSED do quản trò hoặc
moderator chủ động; reconnect trước deadline khôi phục nguyên xúc xắc. Mất host nhạc không dừng ván.

## Thiết kế thực thi

1. Pure TypeScript engine + Zod schemas version 1, reducer với thời gian/xúc xắc truyền từ trusted server.
2. PostgreSQL game_matches, game_settings, game_players, game_moves, game_events, game_results,
   game_spectators và game_receipts. RLS chỉ đọc cho thành viên; cấm mọi direct client write.
3. Worker lấy context/receipt đã xác thực, reconcile người bị kick + deadline, chạy engine và commit
   CAS dưới row lock. Receipt được kiểm tra trước version; retry cùng key trả cùng xúc xắc.
   CSPRNG rejection sampling ở Worker; không có production API nhận dice/state từ client.
4. Timeout được áp dụng khi snapshot/command kế tiếp và bằng cron production mỗi phút. Không có
   timer Worker trong RAM. Lúc không có ai xem, ván bắt kịp timeout từ deadline đã lưu khi mở lại.
5. Lobby, chọn màu/sẵn sàng, invite link cùng phòng, spectator, luật, bàn SVG, nước hợp lệ,
   xúc xắc, lượt, pause/resume, đầu hàng, kết quả nhiều vòng/rematch, hiệu ứng âm thanh opt-in.
6. Private realtime + snapshot polling dự phòng, actor isolation, stale response guard, retry
   cùng receipt cả khi mạng lỗi; rời màn hình không đồng nghĩa đầu hàng.

## Kiểm chứng và phát hành

- Unit: tất cả mặt xúc xắc, spawn/capture/safe/stack/home/exact finish/extra turns/3 sixes,
  thắng/rank/forfeit/timeout/paused/rematch, input sai, mọi biến thể, toàn ván deterministic.
- PostgreSQL cô lập: migrations/RLS/RPC grants, concurrent join/roll/move, duplicate receipt,
  stale CAS, kick/ban/replay, checkpoint persistence, results/event commit và nhạc không đổi.
- Hono API: Auth, strict command schema (cấm dice/state giả), errors, RNG/receipt boundaries.
- Browser fixtures: bốn người, full game deterministic, mobile/light/dark/reduced motion,
  reconnect/missed events, spectator, rematch, bàn phím và cùng IFrame nhạc khi đổi tab.
- Build/typecheck/lint/format/secret scan. Hosted smoke dùng tài khoản/phòng riêng và dọn đúng ID.
- Theo yêu cầu mới: giữ nguyên public, chỉ build vào `.roomtune/game-build`. Hosted migration
  phục vụ bản thử riêng; chưa refresh preview, chưa thêm lịch cron phút vào cấu hình deploy. Xem `GAME.md`.

## Tiến độ

- [x] Đọc đặc tả và kiến trúc/đường Auth/RPC/Realtime/player.
- [x] Engine và kiểm thử deterministic.
- [x] Migration và API; PostgreSQL cô lập, RLS/CAS/receipt/membership.
- [x] Realtime và timeout/recovery; outbox lưu theo tab + tài khoản + phòng + bàn.
- [x] Lobby/bàn SVG/UI; mobile, theme, bàn phím, reduced motion, axe.
- [x] Unit/API/React và E2E fixture bốn trình duyệt; full game + rematch.
- [x] Build local tách biệt, kiểm tra secrets frontend, giữ nguyên public dist.
- [x] Apply hosted migration phục vụ bản chơi thử riêng, có backup/dry-run.
- [x] Hosted Ludo/Auth/Realtime smoke: hai phiên desktop/mobile, chơi, receipt, reconnect và kiểm tra quyền; xem `GAME_HOSTED_CHECK.md`.
- [ ] Bật flags/cron trên public, publish: chờ yêu cầu phát hành riêng.

Bằng chứng và giới hạn được ghi trong `GAME_TESTING.md`; hướng dẫn trong `GAME.md`.

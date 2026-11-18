# Tiến độ Bầu Cua Party

Ngày 17/11/2026. **Đã phát hành tại https://roomtune.dzoanh.me** theo yêu cầu
"commit và public lên cho tôi luôn đi"; đã qua kiểm tra Supabase và HTTPS thật.
MusicBox được miễn PMP theo chỉ dẫn riêng của người dùng.

| Pha            | Trạng thái                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| 0 — Phân tích  | Mapping Auth/Room/queue/Realtime/player/deployment hiện tại                 |
| 1 — Engine     | Payout, 216 outcomes, fairness, phase, episode, unit tests                  |
| 2 — Database   | 3 migrations bổ sung, wallets/ledger/game/penalty, deny-by-default          |
| 3 — API        | Membership, idempotency, server seed, giao dịch, bonus, moderation, notices |
| 4 — Realtime   | Private channel, version/refetch, deadlines, outbox; hosted đã kiểm tra     |
| 5 — UI         | Lobby/bàn riêng, ví, chip, dealer, settings/rules, history/leaderboard      |
| 6 — 3D         | R3F/Three, artwork tự tạo, mặt server, reduced motion/đồ họa nhẹ/âm hiệu    |
| 7 — Phạt nhạc  | Atomic removal/audit/episode, thông báo cả playlist, restore                |
| 8 — Hoàn thiện | Desktop/mobile/light/axe, loading/lỗi, player không remount                 |
| 9 — Bảo mật    | Concurrency, RLS, moderator scope, disconnect, xóa/refund, cross-room       |
| 10 — Kiểm thử  | 442 unit/API; 113 DB; 192 browser đạt, 5 skip; typecheck/lint/build đạt     |
| 11 — Phát hành | Backup, migration 007–009, hosted/HTTPS smoke, tunnel và assets đạt         |

## Sửa trong lượt hoàn thiện

- Modal cam kết cập nhật kết quả khi mở bát và tôn trọng cấu hình xác minh.
- Rời bàn cấm khán giả trả lobby, không rollback vì snapshot không còn quyền.
- RLS moderator không vượt quyền spectator hoặc xem hình phạt riêng chưa được cấp.
- Tắt lịch sử ẩn cả sự kiện vòng trước với thành viên không có quyền.
- Restore tính cả PREPARING/PLAYING trong giới hạn queue/member.
- Thông báo phạt tới playlist, không cấp ví cho người chỉ nghe nhạc.
- Kiểm thử replay so dữ liệu/ledger, không yêu cầu timestamp hiện tại bằng timestamp cũ.

## Phát hành

Build riêng trong quá trình phát triển, sau đó kiểm thử candidate tại 5181 với
Supabase thật trước khi chuyển vào public 4173. Migrations bổ sung, không reset DB.
Tunnel đã cho phép lobby/link bàn Bầu Cua. Giữ 225 assets kể cả chunk cũ cho tab
đang mở và lưu bản trước trong `.roomtune/releases/bau-cua-20261117T155813/previous`.
Trial Ludo 5180 không đổi. Phòng/tài khoản kiểm thử đã dọn; runtime thử 5181 đã dừng.

## Cổng nghiệm thu còn lại

Đã xác minh Auth, private Realtime, người ngoài/bị ban, coin/hình phạt/khôi phục và
hai browser contexts desktop/mobile qua HTTPS. Còn thiết bị vật lý ở hai mạng,
audio/FPS điện thoại, tải lớn và quota hosted. Public vẫn chạy qua máy cá nhân,
không phải một deployment Workers độc lập. Bằng chứng/giới hạn trong
[kiểm thử](BAU_CUA_TESTING.md), hướng dẫn thử/phát hành trong
[vận hành](BAU_CUA_OPERATIONS.md).

## Sửa hiển thị cược ngày 18/11/2026

Giao diện trước chỉ hiện tổng cược mỗi ô và phần của mình dù snapshot đã có tên,
coin và user ID của từng người. Đã thêm hai tên xem nhanh dưới mỗi ô, số người
đặt và hộp chi tiết đầy đủ; mọi nội dung dùng snapshot hiện tại nên tăng/hoàn cược
và vòng mới được cập nhật cùng Realtime. Chủ cái/khán giả vẫn xem được khi nút đặt
cược bị khóa. Không thay luật, API hoặc schema.

Đã kiểm tra hai browser contexts với PostgreSQL thật: cược từ máy khác xuất hiện
trước polling dự phòng 15 giây, tăng cược/hoàn cược, nhiều người, tên dài/mobile,
focus bàn phím, axe và xóa dữ liệu hiển thị cũ khi mở vòng mới. Typecheck, lint,
format và build riêng đạt; 9 ca hồi quy Bầu Cua có sẵn đạt, ca mới đạt khi chạy riêng.

Nghiệm thu hosted candidate ngày 18/11 đã đạt: máy cầm cái nhìn thấy tên và coin
của người đặt qua Realtime. Người dùng đã cho phép commit/public cùng bàn cờ 3D.
Xem [bản phát hành 18/11](RELEASE_2026-11-18.md).

## Cấp coin cho thành viên ngày 18/11/2026

Thêm nút **Cấp coin** ở đầu lobby và bàn Bầu Cua, chỉ hiển thị khi snapshot xác
nhận admin hệ thống (`system_admins`, tài khoản không anonymous). Người nhận
chọn từ thành viên phòng nhạc, gồm người offline/chưa vào bàn. Nhập số nguyên
1–1.000.000, chọn nhanh 1.000/5.000/10.000, lý do 5–200 ký tự và kiểm tra lại
trước khi xác nhận. Chủ phòng/moderator không mặc nhiên được cấp coin.

Dùng lại lệnh `adjust`, khóa giao dịch, receipt, sổ coin và audit đã có. Mất phản
hồi giữ nguyên request ID; nút xác minh trong hộp cấp coin cho phép tiếp tục sau
reload. Điều chỉnh cộng/trừ nâng cao trong chính sách coin vẫn giữ nguyên.

Migration bổ sung `202611180001_coin_adjustment_notifications.sql` đưa thông báo
vào outbox sau audit, cùng giao dịch. Kênh riêng tư của phòng chỉ gửi user ID để
ví người nhận đọc lại dữ liệu, không phát số dư/số coin/lý do ra cả phòng. Tab
ở phòng khác vẫn phục hồi theo polling/focus. Không sửa migrations đã áp dụng.

Đạt 25 kiểm thử Vitest liên quan, 29 nhóm PostgreSQL và cả 13 ca trình duyệt Bầu
Cua (gồm sửa hiển thị cược). Kiểm tra grant trên desktop/mobile, axe, ví lobby
cập nhật trực tiếp và mất phản hồi/reload/retry không cộng trùng. Typecheck, lint,
format và build riêng đạt; 32 client artifacts qua secret scan heuristic. Build
xác nhận public/trial artifacts và deploy pointer không đổi, không restart runtime.

Migration hosted `202611180001_coin_adjustment_notifications.sql` đã áp dụng
thành công trong lượt chuẩn bị phát hành ngày 18/11. Backup mới trước đó không
hoàn tất; không coi file tạm là backup đã kiểm chứng. Nghiệm thu hosted candidate
đã đạt: form admin, cập nhật ví riêng tư, audit, retry không cộng trùng và từ chối
người không có quyền/người nhận ngoài phòng. Phòng và tài khoản thử đã dọn.
Không cần migration mới khi chuyển runtime. Xem [bàn 3D](LUDO_3D.md) và
[bản phát hành 18/11](RELEASE_2026-11-18.md).

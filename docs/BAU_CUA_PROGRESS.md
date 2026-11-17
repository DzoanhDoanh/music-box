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

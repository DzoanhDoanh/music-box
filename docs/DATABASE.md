# Database

Chat bổ sung bằng migration `202611140003_room_chat.sql`, không sửa các migration đã áp dụng.
`rooms.chat_sequence` là bộ đếm riêng (JS safe integer), không tăng room version hay cập nhật playback.
`private.chat_messages` có unique `(room_id,sequence)`, FK cascade tới room/profile, giới hạn body 1.000 ký tự,
và tombstone khi xóa (body rỗng). RPC service-only: `room_chat(actor,room,since)`,
`room_chat_command(actor,room,request,command)`, `chat_export(actor,offset)` (500 tin/trang).

Chat command dùng actor/request advisory lock rồi room row lock theo cùng thứ tự với room command.
Xác minh membership/ban trước receipt replay; receipt scope `chat:<room>` và SHA-256 digest body.
20 lần gửi mới/phút/actor/phòng được kiểm tra trong giao dịch sau receipt, nên retry cùng key không
tiêu thêm quota. Send tăng sequence; remove giữ sequence, xóa body, audit ID. Cả hai phát private
`chat.updated` với payload `{}`. Read luôn lấy 100 tin gần nhất trong 30 ngày theo sequence tăng dần;
unread chỉ đếm tin chưa xóa của người khác sau cursor. Retention qua mutation và maintenance_cleanup.

Migrations `202611130001_schema.sql`, `202611130002_rpc.sql`, `202611130003_maintenance.sql`, `202611130004_account_lifecycle.sql`, `202611140001_device_playback.sql`, `202611140002_reorder_approval.sql` áp dụng theo thứ tự. Bảng public: profiles, system_admins, rooms, room_settings, room_members, songs, queue_entries, votes, playback_sessions, playback_history, playlists, playlist_items, favorites, bans, audit_logs, youtube_search_cache (service-only). Schema private: room_pins (bcrypt), operation_receipts, rate_limits, room_presence, reorder_proposals, reorder_votes.

Migration `202611140002` thêm `room_settings.reorder_approval` default false và constraint chỉ bật cùng MANUAL. Private presence có khóa (room,user,session), sequence tăng, lease 60s; proposal chốt queue_order/electorate, ngưỡng tối thiểu 2, TTL 2 phút, unique partial index chỉ một OPEN mỗi room. Votes khóa (proposal,user), đổi phiếu bằng upsert. SQL tính trạng thái từ thời gian/cấu hình/membership/queue; room command khóa phòng, kiểm tra receipt và áp dụng tất cả vị trí QUEUED trong một transaction khi đủ phiếu, không đổi playback. RPC/helpers/tables không cấp trực tiếp cho anon/authenticated. Maintenance dọn presence cũ hơn 1 ngày và proposals/votes hơn 30 ngày; triển khai cron vẫn cần kiểm chứng vận hành.

Không có room_admins riêng vì role owner/moderator nằm trong room_members. Playback commands và moderation actions được lưu bằng receipt/audit thay vì thêm bảng trùng chức năng. Rooms/queue có version/position monotonic. Unique constraints votes(entry,user), song video ID, playlist items và một bài active. FK và check constraints bảo vệ status/limits.

Read policy kiểm tra membership, thư viện theo chủ sở hữu. authenticated không được insert/update/delete trực tiếp. Mutation RPC chỉ service_role được EXECUTE. Các hàm SECURITY DEFINER đặt search_path rỗng và tham chiếu schema tường minh.

Anonymous Auth vẫn là authenticated; không có policy cho phép toàn bộ authenticated đọc mọi phòng. Không dùng user_metadata để cấp admin. Admin provision bằng Auth dashboard và INSERT system_admins bởi operator.

History phân trang 25; audit phân trang 50, thư viện tối đa 50 playlist × 200 bài, favorites read 200 bài. Migration 004 cho phép bỏ liên kết requested_by khi xóa identity, giữ queue/history và thu hồi host. Maintenance job và metadata refresh có trong Worker, cần deploy và xác minh lịch chạy trước production. Không xóa production để sửa migration.

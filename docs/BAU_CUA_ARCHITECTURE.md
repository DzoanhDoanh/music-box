# Kiến trúc Bầu Cua Party

Triển khai trên stack ROOMTUNE hiện tại: React/Vite/TypeScript, Hono Worker,
Supabase Auth/PostgreSQL/Realtime. Không có game server riêng hoặc dịch vụ trả phí mới.
PostgreSQL là nguồn trạng thái; client gửi ý định, không gửi coin/kết quả quyết toán.

## Tích hợp

- Game Hub → `/room/:id/games/bau-cua` → `/room/:id/games/bau-cua/:table`.
- Module game và Three.js được tải khi cần. HostPlayer/ListenerPlayer giữ nguyên
  instance, hiển thị player đang hoạt động; không tạo iframe nhạc trong game.
- REST: GET/POST `/api/v1/rooms/:id/bau-cua` và `/:table`; GET `/notices`
  chỉ đọc thông báo, không mở ví hoặc thay đổi game.
- Client flag `VITE_ENABLE_BAU_CUA`; server flag `ENABLE_BAU_CUA`. Cả hai mặc định
  tắt trong mẫu cấu hình. Health trả `bauCuaEnabled`, không dùng health thay kiểm tra DB.
- Auth, Origin, Zod, idempotency, rate limiting và xử lý lỗi dùng tầng hiện có.
  Giới hạn riêng của lệnh Bầu Cua: 120/phút/danh tính; reaction: 6/10 giây.

## Dữ liệu và quyền

Migration mới `202611170007` tạo kinh tế/vòng; `008` tạo RPC; `009` cấp quyền/RLS.
Không sửa các migration đã áp dụng trước đó.

| Phạm vi                       | Nơi lưu                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| Ví/sổ/bonus toàn user ID      | `coin_wallets`, `coin_ledger`, `coin_claims`, `private.coin_grants` |
| Chính sách coin hệ thống      | `private.bau_economy`                                               |
| Luật phòng, bàn, thành viên   | `bau_cua_settings`, `bau_cua_tables`, `bau_cua_table_members`       |
| Hàng chờ/phiên cầm cái        | `bau_cua_dealer_queue`, `bau_cua_dealer_sessions`                   |
| Vòng/kết quả, cược, hoạt động | `bau_cua_rounds`, `bau_cua_bets`, `bau_cua_round_events`            |
| Seed chưa mở                  | `private.bau_seeds`                                                 |
| Phạt/chi tiết bài gỡ          | `bau_cua_penalty_executions`, `bau_cua_penalty_songs`               |
| Retry và thông báo bền vững   | `private.bau_receipts`, `private.bau_outbox`                        |
| Nhật ký quản trị              | `audit_logs` có sẵn                                                 |

Kết quả nằm trong bản ghi vòng; luật hình phạt nằm trong cấu hình phòng và snapshot
vòng. Không tạo bảng trùng chức năng. Coin là BIGINT với giới hạn integer an toàn JS.

RLS từ chối ghi trực tiếp; ví/sổ/claim chỉ chủ danh tính được đọc. Thành viên phòng
được xem đúng bàn, tùy quyền khán giả và ban. Tắt lịch sử thì chỉ vòng hiện tại được
công khai; owner/moderator được cấp quyền quản lý vẫn có thể kiểm tra lịch sử.
Thông báo riêng chỉ tới người bị phạt; quản trị được cấp quyền xem lịch sử để khôi phục. Các RPC chỉ cho
service_role gọi, kiểm tra actor từ JWT ở API; SECURITY DEFINER dùng search_path rỗng.

## Giao dịch và thứ tự khóa

Thứ tự: hàng rooms → advisory transaction lock `724001007` → bàn/vòng → ví.
Tác vụ xóa user khóa các room liên quan theo UUID trước khóa kinh tế. Khóa kinh tế
chung bảo vệ ví xuyên phòng/bàn, ưu tiên đúng dữ liệu ở quy mô phòng nhỏ. Đây là điểm
cần đo contention trên hosted trước khi tăng tải; không gọi mạng ngoài trong transaction.

Bet khóa stake ở ví người chơi và liability ròng chính xác ở ví cái. Settlement
giải phóng reserve, ghi sổ, phát hiện episode phá sản, gỡ queue, tăng version và ghi
audit/outbox trong một transaction. Không có trạng thái coin nửa quyết toán.
Receipt chống chạy mutation lần hai nhưng trả snapshot mới sau kiểm tra quyền hiện tại.
Rời bàn trả lobby để bàn cấm khán giả không ngăn người chơi rời; retry không kéo họ lại bàn.

Hủy trước công bố hoàn toàn bộ reserve; sau công bố chỉ được quyết toán. Khi xóa
phòng/user, trigger hoàn vòng chưa công bố hoặc quyết toán kết quả đã biết trước cascade.

## Thời gian và khôi phục

Deadline, action_at, version được lưu DB. Đọc/lệnh hợp lệ tiến triển pha quá hạn;
không có setTimeout giữ Worker sống. Client hẹn đọc tại deadline và đọc dự phòng
15 giây; lease thành viên bàn 75 giây. Mọi tab dùng giờ server đã ước tính độ lệch.

Khóa/lắc có thời gian tối thiểu rồi cửa sổ 2 giây cho cái bấm thao tác. Nếu cái
không bấm, lần đọc kế tiếp tự chuyển pha; reconnect có thể đi qua nhiều pha quá hạn.
Không tự tạo vô hạn vòng khi vắng người. Pause trong vòng chỉ có hiệu lực sau kết quả.
Mất cái vẫn quyết toán cược đã nhận, rồi luân phiên hoặc dừng theo cấu hình.

## Realtime và thông báo

Mỗi bàn dùng private channel `bau:<UUID>`. Outbox gửi `table.updated` chứa event ID,
table/round ID, kind, version, serverTime; không gửi wallet/seed. Queue dùng
`room:<UUID>` / `room.updated`. Supabase realtime.send nằm trong transaction nên dữ
liệu chỉ được phát sau commit. Lỗi send giữ outbox chưa delivered để lần đọc/lệnh sau thử lại.

Client coi sự kiện là tín hiệu refetch, bỏ version cũ, gộp invalidation 120ms và
đọc lại khi reconnect. Duplicate không chạy nghiệp vụ lần nữa. Request chưa rõ kết
quả được giữ trong sessionStorage theo actor/room/table và gửi lại cùng idempotency key.

`penalty.updated` chỉ báo có thay đổi; nội dung lấy qua `/notices` có phân quyền.
Thông báo hoạt động cả ở playlist, không cấp ví cho người chỉ nghe nhạc. Bộ đọc
notices dự phòng 30 giây, khôi phục khi reconnect và tránh toast lặp cùng penalty ID.
Thư viện nhạc, queue và playback giữ lifecycle hiện có.

## Ranh giới đã xác minh

PostgreSQL thật và nhiều browser contexts đã kiểm tra nghiệp vụ. Auth, WebSocket
transport và YouTube trong bộ E2E cục bộ là fixture. Bộ hosted riêng đã kiểm tra
RLS/JWT/private Realtime, gameplay, hình phạt và HTTPS tunnel bằng tài khoản thật
trong phòng tạm. Chưa đo tải lớn, CPU/quota hoặc audio/FPS trên điện thoại thật.
Xem [kiểm thử](BAU_CUA_TESTING.md) và [vận hành](BAU_CUA_OPERATIONS.md).

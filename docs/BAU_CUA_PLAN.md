# Bầu Cua Party — kế hoạch triển khai

Ngày 17/11/2026. Tích hợp vào checkout ROOMTUNE hiện tại; dự án được miễn PMP theo
yêu cầu người dùng. Public hiện tại không đổi trong quá trình xây dựng.

Kế hoạch dưới đây đã được triển khai và kiểm thử cục bộ. Bằng chứng hiện tại trong
[tiến độ](BAU_CUA_PROGRESS.md), [kiểm thử](BAU_CUA_TESTING.md); cổng phát hành và
bản thử dịch vụ thật trong [vận hành](BAU_CUA_OPERATIONS.md). Đã public Bầu Cua
ngày 17/11/2026 sau yêu cầu commit/phát hành riêng của người dùng.

## Phạm vi và thứ tự

1. Engine thuần: sáu biểu tượng, payout, 216 kết quả, state machine và commit/reveal.
2. Migration bổ sung: ví toàn danh tính, ledger, claim, bàn, thành viên, hàng đợi cái,
   phiên cái, vòng, cược, kết quả, sự kiện, hình phạt và outbox. Không sửa migration cũ.
3. RPC giao dịch và API: membership, idempotency, tiền khóa, quyết toán, bonus,
   quản trị, phục hồi theo deadline. Không tin coin/dice từ trình duyệt.
4. Realtime riêng tư và snapshot có version; phục hồi request đang chờ và reconnect.
5. Trang lobby/bàn riêng: betting, ví, dealer, cài đặt, lịch sử, xác minh và phản ứng.
6. Bát/xúc xắc R3F/Three.js, fallback 2D, reduced motion và âm thanh tùy chọn.
7. Kiểm tra bảo mật, cạnh tranh, hình phạt, regression nhạc; build riêng và hướng dẫn.

Mỗi giai đoạn cập nhật BAU_CUA_PROGRESS.md. Chỉ đánh dấu đã xác minh sau khi chạy.

## Điểm tích hợp đã xác định

- React Room giữ lifecycle HostPlayer/ListenerPlayer; đường dẫn con games dùng
  cùng Room. Bầu Cua lazy-load, không tạo/ẩn trình phát nhạc mới.
- Hono xác thực getUser, rate limit, Origin và service-role RPC đã có.
- Supabase profiles/room_members/bans là nguồn danh tính/quyền. Dùng game_access.
- Queue thực tế: queue_entries.requested_by/requested_at, status QUEUED; REMOVED
  là soft removal. rooms.version + room.updated làm mới hàng chờ.
- Private Realtime qua realtime.messages; không cho client ghi sự kiện authoritative.
- Thử PostgreSQL ở 55439, browser fixture tách riêng; không dùng phòng người dùng.
- Chỉ build vào .roomtune; giữ dist, con trỏ deploy, preview 4173 và tunnel.

## Quyết định sản phẩm

Ví dùng chung toàn user ID để đổi bàn/phòng không nhận lại 10.000 coin. Chính sách
cấp coin/bonus thuộc quản trị hệ thống; chủ phòng cấu hình giới hạn cược, bàn và
hình phạt của phòng. Chính sách vòng được snapshot khi bắt đầu. Coin chỉ giải trí.
Hình phạt mặc định bật, được hiển thị trước khi tham gia/đặt cược.

Phát hành là bước riêng sau khi bản triển khai và kiểm thử có thể xem lại; yêu cầu
public của đợt cờ cá ngựa trước không tự áp dụng cho tính năng Bầu Cua mới.

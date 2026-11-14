# Mô hình bảo mật và giới hạn

Chat (14/11/2026): bảng private và ba RPC mới chỉ service_role được truy cập. Backend xác minh actor,
SQL kiểm tra lại membership/ban cho read, send, remove và receipt replay; nội dung React escape.
Ứng dụng gửi private Broadcast `{}` để yêu cầu đọc lại qua API, không chứa body/tác giả (hosted
Realtime thêm trường `id` vận chuyển). Client đã bị
thu hồi membership không thể nhận thêm nội dung qua channel còn cache quyền. Xóa tin clears body;
receipt gửi chỉ giữ SHA-256 digest, audit chỉ ID. Export chỉ own messages; account/room deletion cascade.
Tin quá 30 ngày không được trả về, được dọn vật lý khi có mutation hoặc maintenance.

Cache/draft/read marker chat tách theo room và actor. Chỉ cursor số được lưu trên trình duyệt;
draft trong memory. API kiểm tra expectedActor trước khi gửi để bản nháp cũ không chạy dưới tài khoản
khác, kể cả khi session thay đổi ngay trước request. Quyền bị thu hồi ẩn cả cache chat trên UI.

Backend xác minh access token qua Supabase Auth getUser. Không tin user_metadata. Service secret chỉ Worker; mọi RPC service-only, actor từ token. SQL kiểm tra lại quyền room/role trong giao dịch. RLS chặn cross-room và dữ liệu cá nhân; clients không ghi bảng business hoặc gọi RPC với actor giả. Functions SECURITY DEFINER search_path rỗng, grants rõ.

PIN bcrypt trong schema private; rate counter commit riêng trước join nên PIN sai không rollback số lần thử. Rate limits theo user và hashed IP của CF-Connecting-IP; local chung bucket. Cần Cloudflare WAF/Auth CAPTCHA để chống nhiều anonymous identities và phân tán IP trước public rollout. Không thể dùng ban identity ẩn danh để chặn tuyệt đối một người thật.

CSRF: Bearer token không tự gửi như cookie; origin guard không CORS wildcard. XSS: React escape text, không dangerouslySetInnerHTML, strict production CSP; frontend lưu Supabase session theo SDK để private realtime hoạt động. CSP giảm rủi ro nhưng không biến localStorage thành HttpOnly. Không cho arbitrary URL fetch; YouTube host cố định phía server, URL parser allowlist.

Host lease 30s, heartbeat 10s, local watchdog 25s; fencing+run reject stale completions. Hết lease máy host pause. DB broadcast là invalidation; authenticated không thể gửi broadcast điều khiển, presence chỉ là UX. Cần kiểm tra thực tế thu hồi quyền trên channel đã kết nối vì Realtime authorization có caching; API luôn kiểm tra membership lại.

Gia hạn phiên (14/11/2026): lỗi Auth mạng/429/5xx được phân biệt với token thiếu/không hợp lệ; không đổi thời hạn JWT hay cấu hình phiên hosted. HTTP 401 xác thực cho phép gửi lại đúng một lần sau gia hạn, bởi middleware chưa thực hiện business mutation; lỗi timeout mơ hồ vẫn chỉ retry thao tác có receipt. Mỗi request kiểm tra identity trước lần gửi và khi nhận kết quả; sự kiện đăng xuất/đổi tài khoản hủy hiệu lực kết quả cũ. Snapshot/cache phòng tách theo user. Lỗi tạm thời không tháo IFrame nhưng không gia hạn host lease; quyền bị thu hồi hoặc watchdog hết hạn vẫn dừng nhạc. Không tự tạo guest, không bỏ Auth/RLS/fencing.

Biểu quyết đổi vị trí (14/11/2026): online dùng RPC `room_presence` service-only, actor lấy từ Auth và SQL xác minh membership/ban lại. Lease server 60 giây, sequence tăng để gạt heartbeat trễ, đếm DISTINCT thành viên thay vì số tab. Realtime Presence vẫn chỉ phục vụ hiển thị. Một identity có một phiếu; đây không phải cơ chế xác minh một con người thật nếu họ tạo nhiều anonymous identities.

Đề xuất chốt electorate và ngưỡng `max(2, floor(n/2)+1)` lúc tạo; client không quyết định danh sách/quorum. Chỉ voter thuộc electorate và còn online mới gửi được phiếu. Phòng chỉ có một đề xuất đang mở trong 2 phút; thay hàng chờ/thu hồi quyền/tắt tính năng làm vô hiệu. Transaction khóa phòng và kiểm tra receipts trước khi đổi thứ tự; cả owner/moderator cũng không dùng direct reorder khi cài đặt bật. Tắt tính năng chỉ owner được phép. Không đổi playback/run/fence/lease khi sắp xếp. Giới hạn đề xuất 6/phút theo actor/phòng, cùng rate limit Auth chung; private tables/helpers không cấp cho anon/authenticated.

Retention mới đi qua `maintenance_cleanup`: presence tombstones quá 1 ngày, proposals/ballots quá 30 ngày. Chạy cron trên hạ tầng public vẫn cần bước vận hành riêng như giới hạn dưới đây; inline heartbeat cũng dọn presence cũ của phòng hiện tại.

## Chưa đủ điều kiện tuyên bố production-ready

- Auth/Realtime hosted và private-only đã đạt kiểm thử trong HOSTED_CHECK.md; một video thật có âm thanh được người dùng xác nhận. Chưa kiểm thử Cloudflare deployment và toàn bộ điều kiện playback/reconnect thực tế.
- CAPTCHA Turnstile có widget/code nhưng chưa có site key/secret để kiểm chứng thật; maintenance job chưa deploy/kiểm tra scheduled invocation thật. Export JSON và xóa tài khoản có mã nguồn; xóa account owner bị chặn cho đến khi operator chuyển quyền. Queue/history giữ lại bản ghi đã bỏ liên kết identity. Auth admin deletion hosted đã dọn được tài khoản kiểm thử; luồng xóa tài khoản từ giao diện chưa được kiểm thử đầy đủ với hosted Auth.
- Chưa pentest độc lập, chưa load test toàn HTTP/WebSocket 30 người.
- Anonymous logout có nguy cơ mất quyền truy cập hồ sơ; cần nâng cấp identity để recovery lâu dài.

Các test database và unit không thay cho đánh giá hạ tầng, cấu hình secrets, operator access hoặc quyền project thật.

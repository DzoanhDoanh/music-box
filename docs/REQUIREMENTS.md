> Cập nhật theo yêu cầu người dùng ngày 14/11/2026: bổ sung tùy chọn phát chỉ trên máy host hoặc trên tất cả thiết bị. Mỗi phòng vẫn chỉ có một host điều khiển bài chung. Thêm nút Rời phòng dễ thấy trên mobile và desktop. Các điều khoản một máy nối loa bên dưới mô tả chế độ HOST_ONLY mặc định.

> Bổ sung cùng ngày: đơn giản hóa việc vào lại phòng. Người đã tham gia có lối vào một chạm trên trang chủ, màn hình nhập mã và danh sách phòng; rời phòng giữ phiên. Đóng/mở lại trình duyệt dùng phiên đã lưu, không yêu cầu nhập mã/PIN lại khi vẫn là thành viên. Quên phiên hoặc xóa dữ liệu trình duyệt vẫn kết thúc khả năng quay lại bằng phiên đó.

# ROOMTUNE — MASTER PROMPT FOR CODEX
> Bổ sung ngày 14/11/2026: thu gọn player trên màn hình lớn, dành phần lớn chiều rộng cho hàng chờ và đưa danh sách bài lên cạnh player. Giữ player ổn định khi đổi tab/resize. Bổ sung phản hồi kết quả/lỗi rõ ràng và hiệu ứng đang xử lý cho thao tác chậm; tránh gửi trùng, thông báo không che video.

# Build a Complete, Beautiful, Production-Ready Music Room

Bạn là một đội phát triển phần mềm chuyên nghiệp gồm:

- Principal Software Architect
- Senior Full-stack Engineer
- Senior Frontend Engineer
- UI/UX Product Designer
- Database Engineer
- Security Engineer
- QA Automation Engineer
- DevOps Engineer

NHIỆM VỤ CỦA BẠN:

Thiết kế, lập kế hoạch và trực tiếp xây dựng từ đầu đến cuối
một sản phẩm web hoàn chỉnh có tên ROOMTUNE.

ROOMTUNE là nền tảng nghe nhạc YouTube chung trong phòng:
mọi người sử dụng điện thoại để tìm kiếm, yêu cầu và bình
chọn bài hát, trong khi một máy tính chính kết nối loa
chịu trách nhiệm phát nhạc.

ĐÂY LÀ SẢN PHẨM HOÀN CHỈNH, KHÔNG PHẢI MVP.

Tôi muốn một sản phẩm có chất lượng tương đương một
ứng dụng SaaS hiện đại: giao diện đẹp, trải nghiệm mượt,
tính năng đầy đủ, bảo mật, dễ sử dụng, dễ deploy,
dễ bảo trì và có thể mở rộng lâu dài.

Ngôn ngữ giao diện: TIẾNG VIỆT.
Ngôn ngữ source code: English.
Tài liệu hướng dẫn sử dụng: Tiếng Việt.

========================================================
PHẦN 1 — NGUYÊN TẮC LÀM VIỆC
========================================================

Bạn không chỉ đóng vai trò tư vấn.

Bạn phải trực tiếp:
1. Phân tích yêu cầu.
2. Thiết kế kiến trúc.
3. Thiết kế giao diện.
4. Thiết kế database.
5. Viết toàn bộ source code.
6. Cấu hình các dịch vụ.
7. Tạo automated tests.
8. Chạy và sửa lỗi.
9. Tối ưu hiệu năng.
10. Chuẩn bị deployment.
11. Deploy khi có quyền và credentials phù hợp.
12. Kiểm tra kết quả cuối cùng.
13. Viết tài liệu vận hành.

NGUYÊN TẮC BẮT BUỘC:

- Không chỉ viết kế hoạch rồi dừng.
- Không chỉ tạo skeleton.
- Không tạo website chỉ có giao diện.
- Không để các nút bấm không hoạt động.
- Không dùng fake data trong production.
- Không dùng mock thay thế chức năng thật.
- Không bỏ qua lỗi TypeScript.
- Không tắt ESLint để che giấu lỗi.
- Không bỏ qua test thất bại.
- Không dùng "any" tùy tiện.
- Không hardcode credentials.
- Không đưa secret vào Git.
- Không tự ý sử dụng dịch vụ trả phí.
- Không tuyên bố thành công khi chưa xác minh.
- Không xóa dữ liệu production để sửa lỗi migration.
- Không tự deploy hoặc push vào nơi chưa được cấp quyền.

Khi thiếu API key hoặc quyền triển khai bên ngoài:
- Hoàn thành toàn bộ phần code có thể làm được.
- Tạo cấu hình mẫu.
- Ghi rõ credential nào còn thiếu.
- Tiếp tục kiểm thử bằng fixture/mocks đúng mục đích.
- Không tuyên bố tích hợp thật đã được xác minh.

Sau mỗi giai đoạn, cập nhật docs/PROGRESS.md.

Nếu phiên làm việc bị giới hạn:
- Lưu chính xác trạng thái thực hiện.
- Ghi những test đã chạy.
- Ghi phần còn thiếu và cách tiếp tục.
- Không khởi tạo lại dự án khi phiên sau tiếp nối.

========================================================
PHẦN 2 — TECH STACK
========================================================

Sử dụng kiến trúc MODULAR MONOLITH.

FRONTEND:
- React
- Vite
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui
- Radix UI khi cần
- Lucide React
- React Router
- TanStack Query
- React Hook Form
- Zod
- Zustand nếu thực sự cần shared UI state

BACKEND:
- Hono
- TypeScript
- Cloudflare Workers
- Cloudflare Workers Static Assets
- Cloudflare Vite Plugin
- Zod validation
- API REST có version

DATABASE:
- PostgreSQL trên Supabase
- Supabase SQL migrations
- PostgreSQL transactions
- Row Level Security
- Database functions/RPC cho thao tác atomic
- Drizzle ORM nếu có lợi ích thực tế

AUTHENTICATION:
- Supabase Auth
- Anonymous authentication cho thành viên
- Email/password cho admin
- Phân quyền tại backend và database

REALTIME:
- Supabase Realtime Broadcast
- Supabase Presence khi cần
- Private channels
- Reconnect và resynchronization

YOUTUBE:
- YouTube IFrame Player API
- YouTube Data API v3

DEPLOYMENT:
- Cloudflare Workers
- Wrangler
- Supabase hosted PostgreSQL
- GitHub Actions CI nếu phù hợp

TESTING:
- Vitest
- React Testing Library
- Playwright
- Database integration tests
- API tests
- Realtime tests

YÊU CẦU CÔNG NGHỆ:

- Ưu tiên stable versions hiện hành.
- Kiểm tra tương thích trước khi cài.
- Dùng pnpm và lockfile.
- Một repository.
- Không dùng microservices.
- Không dùng Redis nếu chưa cần.
- Không bắt buộc Docker trong production.
- Không dùng Firebase.
- Không tích hợp Telegram.
- Không dùng Next.js nếu React SPA đã đủ.
- Không triển khai server Node.js chạy 24/7.
- Không phụ thuộc vào RAM của Worker để lưu dữ liệu.
- Không sử dụng ORM nặng khi không cần thiết.

THIẾT KẾ DỄ MỞ RỘNG:

Tách các lớp nghiệp vụ:
- AuthService
- RoomService
- MemberService
- QueueService
- VotingService
- PlaybackService
- YouTubeService
- PlaylistService
- RealtimeService
- SettingsService

Logic nghiệp vụ không được phụ thuộc trực tiếp vào
một hosting provider.

Ưu tiên interfaces/adapters rõ ràng.

========================================================
PHẦN 3 — PRODUCT VISION
========================================================

ROOMTUNE phải mang lại cảm giác:

- Hiện đại.
- Cao cấp.
- Nhanh.
- Dễ hiểu.
- Ít thao tác.
- Trực quan.
- Mượt trên điện thoại.
- Tốt trên màn hình lớn.
- Không cần kiến thức kỹ thuật để sử dụng.

Một người mới phải có thể tham gia phòng và thêm
bài hát đầu tiên trong khoảng vài thao tác đơn giản.

Ứng dụng phải đủ hoàn thiện để sử dụng hằng ngày,
không mang cảm giác của một dự án thử nghiệm.

TARGET USERS:
- Chủ phòng.
- Thành viên trong phòng.
- Người quản trị hệ thống.

USE CASES:
- Phòng làm việc.
- Phòng sinh hoạt chung.
- Phòng giải trí cá nhân.
- Buổi họp mặt bạn bè.
- Không gian có một thiết bị phát nhạc chung.

HỆ THỐNG PHẢI HỖ TRỢ NHIỀU PHÒNG.

Mỗi phòng có:
- Room ID.
- Room code.
- Tên.
- Mô tả.
- Mã PIN tùy chọn.
- Danh sách thành viên.
- Hàng chờ độc lập.
- Bài đang phát riêng.
- Chủ phòng riêng.
- Cài đặt riêng.
- Lịch sử riêng.

========================================================
PHẦN 4 — DESIGN SYSTEM CHUYÊN NGHIỆP
========================================================

Giao diện là một trong những ưu tiên cao nhất.

Không sử dụng giao diện admin template mặc định,
không copy nguyên mẫu Spotify/YouTube.

Hãy thiết kế một visual identity riêng cho ROOMTUNE.

PHONG CÁCH:

Modern Music Experience + Premium SaaS Dashboard.

ĐẶC ĐIỂM:
- Dark mode đẹp là mặc định.
- Light mode hoàn chỉnh.
- Background trung tính, có chiều sâu.
- Accent tím/violet hoặc indigo tinh tế.
- Điểm nhấn bằng gradient nhẹ.
- Card có bo góc hợp lý.
- Typography hiện đại.
- Có hệ thống spacing nhất quán.
- Icon đồng bộ.
- Không lạm dụng glassmorphism.
- Không dùng quá nhiều hiệu ứng phát sáng.
- Không dùng màu gây mỏi mắt.
- Không nhồi quá nhiều thành phần trên một màn hình.

FONT:
- Sử dụng font hiện đại hỗ trợ tiếng Việt tốt.
- Có typography scale rõ ràng.
- Tiêu đề, nội dung và metadata có phân cấp hợp lý.

RESPONSIVE:
- Mobile 320px trở lên.
- Tablet.
- Laptop.
- Desktop.
- Màn hình lớn dùng làm host dashboard.

MOBILE:
- Ưu tiên thao tác bằng một tay.
- Touch target đủ lớn.
- Navigation dễ dùng.
- Có thể dùng bottom navigation nếu hợp lý.
- Không có horizontal overflow.
- Keyboard trên điện thoại không phá layout.
- Form dễ nhập và hiển thị lỗi.

ANIMATIONS:
- Smooth transitions.
- Hover states.
- Press feedback.
- Skeleton loading.
- Toast notifications.
- Dialog animations.
- Queue item transitions.
- Subtle microinteractions.

Tôn trọng prefers-reduced-motion.

ACCESSIBILITY:
- Semantic HTML.
- Keyboard navigation.
- Visible focus state.
- ARIA labels.
- Contrast hợp lý.
- Screen-reader friendly controls.
- Không phụ thuộc vào màu sắc để truyền tải trạng thái.

DESIGN QUALITY:

Mỗi màn hình phải có:
- Loading state.
- Empty state.
- Error state.
- Success feedback.
- Offline state khi cần.
- Confirmation cho thao tác nguy hiểm.

Không dùng alert() mặc định cho các tương tác chính.
Sử dụng toast/dialog chuyên nghiệp.

========================================================
PHẦN 5 — CÁC MÀN HÌNH BẮT BUỘC
========================================================

A. LANDING PAGE

Thiết kế landing page giới thiệu ROOMTUNE:

- Logo.
- Hero section.
- Tiêu đề dễ hiểu.
- Mô tả công dụng.
- Nút tham gia phòng.
- Nút tạo/quản lý phòng.
- Giải thích cách sử dụng.
- Các tính năng chính.
- Responsive đẹp.
- Footer.

Không làm landing page quá nặng.
Ưu tiên tốc độ tải và tính rõ ràng.

B. JOIN ROOM PAGE

- Nhập mã phòng.
- Nhập tên hiển thị.
- Nhập PIN nếu phòng yêu cầu.
- Kiểm tra phòng tồn tại.
- Kiểm tra phòng bị khóa.
- Hiển thị thông báo rõ nếu phòng đầy.
- Tham gia bằng URL/QR.
- Lưu tên gần nhất của người dùng.
- Tự phục hồi session khi refresh.

C. MEMBER DASHBOARD

Đây là giao diện dùng nhiều nhất trên điện thoại.

Bao gồm:
- Tên phòng.
- Số người online.
- Avatar và tên của mình.
- Bài hát đang phát.
- Thumbnail.
- Tên bài.
- Tên kênh.
- Người yêu cầu.
- Trạng thái đang phát/tạm dừng.
- Danh sách chờ.
- Tìm kiếm bài hát.
- Thêm link YouTube.
- Nút vote/unvote.
- Lượt vote.
- Thời gian chờ ước tính khi đáng tin cậy.
- Lịch sử bài đã phát.
- Bài do mình yêu cầu.
- Bài yêu thích.
- Trạng thái kết nối.

Không cho thành viên điều khiển player nếu không có quyền.

D. HOST DASHBOARD

Đây là màn hình dành cho máy tính nối loa.

Yêu cầu thiết kế đẹp, dễ quan sát từ xa.

Bao gồm:
- Embedded YouTube Player thực.
- Tên bài đang phát.
- Thumbnail/metadata khi phù hợp.
- Người yêu cầu.
- Thời gian phát.
- Play/Pause.
- Next.
- Volume.
- Seek khi được hỗ trợ và cho phép.
- Queue.
- Drag & drop reorder.
- Remove song.
- Clear queue.
- QR code.
- Room code.
- Số người online.
- Player status.
- Server status.
- Internet status.
- Autoplay blocked warning.
- Host ownership status.
- Phím tắt điều khiển phù hợp.

Thiết kế player và queue bố trí hợp lý.

Không giấu YouTube Player để chỉ phát âm thanh.

E. ROOM ADMIN PAGE

- Tổng quan phòng.
- Quản lý thành viên.
- Kick/ban thành viên.
- Quản lý playlist.
- Danh sách bài.
- Quản lý lịch sử.
- Quản lý yêu cầu bài hát.
- Quản lý quyền.
- Xem audit log.
- Cài đặt hàng chờ.
- Cài đặt giới hạn.
- Cài đặt mã phòng/PIN.
- Cấu hình chống spam.

F. SETTINGS PAGE

Nhóm cài đặt:
- General.
- Room access.
- Queue rules.
- Voting rules.
- Playback rules.
- Membership limits.
- Moderation.
- Appearance.
- Data management.
- System information.

Cài đặt phải được lưu thật và có hiệu lực.

G. USER PROFILE

Cho thành viên ẩn danh:
- Tên hiển thị.
- Avatar generated hoặc avatar tùy chọn hợp lệ.
- Bài đã chọn.
- Bài yêu thích.
- Lịch sử yêu cầu.
- Playlist cá nhân nếu được hỗ trợ.

Không yêu cầu người dùng phải tạo tài khoản.

H. ERROR PAGES

- 404.
- Không tìm thấy phòng.
- Không có quyền.
- Phòng bị khóa.
- Hết phiên.
- Mất kết nối.
- Backend unavailable.
- YouTube API unavailable.

Thiết kế tất cả các trạng thái này thống nhất.

========================================================
PHẦN 6 — AUTHENTICATION & PERMISSIONS
========================================================

THÀNH VIÊN:

Sử dụng Supabase Anonymous Authentication.

Khi thành viên tham gia:
1. Tạo/khôi phục anonymous session.
2. Nhập tên.
3. Nhập room code.
4. Xác minh PIN nếu có.
5. Server tạo membership hợp lệ.
6. Thành viên truy cập room dashboard.

Không yêu cầu email, mật khẩu hoặc Telegram.

LƯU Ý:
Supabase anonymous users sử dụng database role
"authenticated", không được coi tất cả authenticated
users đều là thành viên của mọi phòng.

RLS và backend phải kiểm tra room membership.

ADMIN:
- Supabase Auth email/password.
- Không mở đăng ký admin công khai.
- Bootstrap admin bằng cơ chế setup an toàn.
- Owner có thể quản lý phòng của mình.
- Không dùng user_metadata do client tự sửa
  để xác định quyền quản trị.
- Có thể thu hồi quyền và session.

ROLES:
- Guest Member.
- Room Moderator (nếu bật).
- Room Owner / Host.
- System Admin nếu cần vận hành nhiều phòng.

Mọi quyền phải được xác minh ở backend.

SECURITY REQUIREMENTS:
- Secure session handling.
- Token validation.
- Strict authorization.
- Room-scoped access.
- Row Level Security.
- Rate limiting.
- Anti-brute-force.
- Input validation.
- XSS protection.
- CSRF protection theo mô hình session được chọn.
- Safe CORS.
- Security headers.
- No leaked credentials.
- No public service-role key.

Với Supabase Auth và Realtime:
thiết kế session phù hợp cho SPA và private channels.
Không cố ép HttpOnly-only nếu làm hỏng cơ chế
Realtime authentication; thay vào đó đánh giá rõ
token storage, XSS, expiry, refresh và bảo vệ thực tế.

========================================================
PHẦN 7 — DATABASE DESIGN
========================================================

PostgreSQL là SINGLE SOURCE OF TRUTH.

Thiết kế các bảng cần thiết:

- profiles
- rooms
- room_members
- room_settings
- room_admins
- songs
- queue_entries
- votes
- playback_sessions
- playback_commands
- playback_history
- playlists
- playlist_items
- favorites
- moderation_actions
- bans
- audit_logs

Có thể điều chỉnh schema nếu hợp lý.

YÊU CẦU:

- UUID primary keys.
- Foreign keys.
- Unique constraints.
- Indexes.
- CreatedAt/UpdatedAt.
- Transaction handling.
- Migrations.
- RLS.
- Database constraints.
- Pagination.
- Data retention.
- Safe deletion.

Không lạm dụng bảng nếu không cần thiết.

QUEUE:
Một bài hát trong hàng chờ phải có:
- id
- room_id
- youtube_video_id
- requested_by
- requested_at
- status
- position
- vote_count hoặc derived vote count
- playback_run_id khi cần
- version hoặc generation phù hợp
- failure_reason
- created_at
- updated_at

Không tin vote_count do frontend gửi.

DATABASE MUTATIONS:
- Sử dụng PostgreSQL transactions.
- Dùng RPC/SQL functions cho các thao tác atomic.
- Không thực hiện read-modify-write dễ race condition.
- Dùng idempotency keys.
- Giữ queue version tăng đơn điệu.
- Không để duplicate queue positions.
- Không làm mất bài khi nhiều request đồng thời.

Nếu dùng SECURITY DEFINER functions:
- Quyền EXECUTE phải tối thiểu.
- Cấu hình search_path an toàn.
- Kiểm tra người gọi và quyền room membership.
- Không tạo đường bypass RLS.

========================================================
PHẦN 8 — YOUTUBE INTEGRATION
========================================================

Chỉ sử dụng API chính thức của YouTube.

FEATURES:
- Tìm kiếm bài bằng tên.
- Hiển thị kết quả.
- Thumbnail.
- Video title.
- Channel title.
- Duration.
- Dán link YouTube.
- Kiểm tra video ID.
- Kiểm tra khả năng nhúng khi có thể.
- Thêm bài vào queue.
- Phát qua IFrame.
- Chuyển bài khi video kết thúc.
- Xử lý video lỗi.
- Xử lý autoplay blocked.

LINK SUPPORT:
- youtube.com/watch?v=
- youtu.be/
- music.youtube.com/watch?v=
- youtube.com/shorts/
- m.youtube.com/watch?v=

Chỉ chấp nhận YouTube URLs hợp lệ.

YOUTUBE SEARCH:
- Server-side API calls.
- API key là server secret.
- Debounce tìm kiếm.
- Rate limit.
- Cache phù hợp với chính sách YouTube.
- Không spam requests.
- Không giả định quota là vô hạn.
- Kiểm tra quota hiện hành.
- Có trạng thái quota exceeded.
- Có fallback nhập link khi tìm kiếm unavailable.

VIDEO VALIDATION:
- Video tồn tại.
- Không bị private/deleted.
- Không quá thời lượng cho phép.
- Không phải livestream nếu chưa hỗ trợ.
- Xử lý video không thể embed.
- Xử lý region/age restrictions.
- Xử lý metadata lỗi hoặc không đầy đủ.

PLAYER:
- YouTube IFrame Player API.
- onReady.
- onStateChange.
- onError.
- onAutoplayBlocked.
- loadVideoById.
- playVideo.
- pauseVideo.
- seekTo khi phù hợp.
- setVolume khi phù hợp.

YOUTUBE COMPLIANCE:

- Không dùng yt-dlp.
- Không tải MP3/MP4.
- Không extract audio.
- Không che hoặc giấu player.
- Không tự chặn quảng cáo.
- Không bypass quảng cáo.
- Không giả lập tương tác để bypass autoplay.
- Không hứa phát nền khi host browser đóng.
- Không vi phạm chính sách YouTube API.
- Bảo đảm referrer/origin của iframe đúng yêu cầu.
- Không cấu hình Referrer-Policy gây lỗi player.

Phải kiểm tra chính sách YouTube mới nhất trước
khi triển khai các chức năng player.

========================================================
PHẦN 9 — PROFESSIONAL QUEUE SYSTEM
========================================================

Đây là phần nghiệp vụ quan trọng nhất.

CHỨC NĂNG:
- Thêm bài.
- Xóa bài.
- Vote/unvote.
- Sắp xếp lại.
- Ưu tiên bài.
- Lịch sử phát.
- Chống trùng.
- Giới hạn bài/người.
- Giới hạn tổng queue.
- Tự chuyển bài.
- Bỏ qua bài lỗi.
- Không mất queue khi refresh.
- Không mất queue khi deploy.
- Không mất queue khi host reconnect.

QUEUE MODES:

1. FIFO:
Bài vào trước phát trước.

2. VOTING:
Bài có nhiều vote được ưu tiên.
Tie-breaker deterministic.

3. FAIR QUEUE:
Cố gắng tránh một thành viên chiếm quá nhiều
vị trí liên tiếp.

4. MANUAL:
Host có thể thay đổi thứ tự.

Chế độ được cấu hình tại room settings.

Khi đổi chế độ:
- Không được làm mất bài.
- Không làm gián đoạn bài đang phát.
- Recalculate queue an toàn.

QUEUE STATE:
- QUEUED
- PREPARING
- PLAYING
- PLAYED
- SKIPPED
- FAILED
- REMOVED

QUY TẮC:
- Một bài chỉ PLAYING một lần trong một playback run.
- Không skip hai bài do event lặp.
- Không phát trùng do reconnect.
- Bài đang phát không bị vote làm thay đổi.
- Host có quyền điều khiển ưu tiên.
- Member chỉ xóa bài của mình nếu cho phép.
- Actions phải có permission checks.

CONCURRENCY TESTS:
- 30 users cùng thêm bài.
- 30 users cùng vote.
- Host bấm Next khi video vừa ENDED.
- Hai lệnh Next đồng thời.
- Network reconnect gửi lại request.
- Stale events từ host cũ.
- Duplicate request IDs.

Kết quả phải deterministic và không mất dữ liệu.

========================================================
PHẦN 10 — PLAYBACK ENGINE
========================================================

Thiết kế một playback state machine rõ ràng.

STATES:
- IDLE
- WAITING_FOR_HOST
- NEEDS_USER_GESTURE
- LOADING
- PLAYING
- PAUSED
- BUFFERING
- ERROR

SERVER:
- Giữ playback intent.
- Quản lý quyền.
- Chọn bài kế tiếp.
- Lưu playback state.
- Xử lý command idempotency.

HOST BROWSER:
- Điều khiển YouTube Player thật.
- Báo trạng thái player.
- Báo video ended.
- Báo lỗi.
- Báo autoplay blocked.
- Báo heartbeat.

HOST OWNERSHIP:
- Một active host/player controller mỗi phòng.
- Có host lease và fencing token.
- Có takeover an toàn.
- Stale host không thể gửi command còn hiệu lực.
- Refresh host không làm tăng số lần skip.

RECOVERY:
- Host reconnect.
- Server restart.
- Client reconnect.
- Network intermittent.
- Video failed.
- API quota exceeded.
- Browser autoplay blocked.

Khi host quay trở lại:
- Lấy state từ server.
- Reconcile current playback run.
- Không khẳng định đang phát nếu player chưa xác nhận.
- Nếu browser yêu cầu thao tác, hiển thị nút
  "Tiếp tục phát nhạc".

Không retry vô hạn.
Không skip video chỉ vì quảng cáo hoặc buffering kéo dài.

========================================================
PHẦN 11 — REALTIME SYSTEM
========================================================

Dùng Supabase Realtime Broadcast.

Không dùng realtime làm database.

DATABASE:
- Là nguồn dữ liệu chính xác.

REALTIME:
- Thông báo thay đổi.
- Đồng bộ UI.
- Member presence.
- Playback status.
- Queue status.

EVENTS:
- room.updated
- member.joined
- member.left
- member.kicked
- queue.updated
- queue.reordered
- vote.updated
- playback.updated
- player.error
- host.connected
- host.disconnected
- settings.updated

YÊU CẦU:
- Private channel mỗi room.
- RLS kiểm tra room membership.
- Không cho member giả mạo sự kiện điều khiển.
- Không để raw client broadcast thay thế trusted mutation.
- Snapshot endpoint.
- Queue versioning.
- Reconnect resync.
- Duplicate event handling.
- Event ordering validation.
- Cleanup subscriptions.
- Không tạo multiple subscriptions ngoài ý muốn.

Đảm bảo database commit trước khi client coi thao tác
là thành công.

========================================================
PHẦN 12 — PLAYLIST, FAVORITES & HISTORY
========================================================

PLAYLISTS:
- Tạo playlist.
- Đổi tên.
- Xóa playlist.
- Thêm bài vào playlist.
- Xóa bài khỏi playlist.
- Xem danh sách playlist.
- Thêm một hoặc nhiều bài vào queue.
- Giới hạn độ dài thao tác batch.
- Không phát song song nhiều bài.
- Kiểm tra video hợp lệ trước khi enqueue.

FAVORITES:
- Lưu bài yêu thích.
- Xóa yêu thích.
- Xem danh sách.
- Thêm vào queue từ favorites.

HISTORY:
- Lịch sử bài đã phát.
- Người yêu cầu.
- Thời gian phát.
- Trạng thái played/skipped/failed.
- Thêm lại vào queue.
- Phân trang.
- Lọc/tìm kiếm.

LƯU Ý:
Tôn trọng các giới hạn lưu trữ và làm mới metadata
theo chính sách YouTube hiện hành.

========================================================
PHẦN 13 — ADMIN FEATURES
========================================================

ADMIN DASHBOARD:
- Danh sách phòng.
- Tạo phòng mới.
- Chỉnh sửa phòng.
- Khóa/mở phòng.
- Xem thành viên.
- Xem bài đang phát.
- Xem queue.
- Xem lịch sử.
- Xem tình trạng host.
- Xem cài đặt.
- Quản lý moderator.

ROOM SETTINGS:
- Tên phòng.
- Mô tả.
- Room PIN.
- Room capacity.
- Số bài mỗi thành viên.
- Max video duration.
- Max queue size.
- Queue mode.
- Vote on/off.
- Allow duplicates.
- Allow guest remove own songs.
- Require approval.
- Auto advance.
- Allowed/blocked video list nếu cần.
- Restricted room mode.

MODERATION:
- Kick.
- Ban.
- Unban.
- Clear queue.
- Remove any song.
- Disable song requests.
- Approve/reject requests.
- Audit admin actions.
- Chống spam.

Không thực hiện thao tác destructive ngay mà không
có confirmation khi cần.

========================================================
PHẦN 14 — USER EXPERIENCE DETAILS
========================================================

Tối ưu từng thao tác thường gặp.

SEARCH EXPERIENCE:
- Search bar nổi bật.
- Debounced typing.
- Keyboard support.
- Clear search.
- Loading skeleton.
- Search results có thumbnail.
- Add button rõ ràng.
- Đánh dấu bài đã có trong queue.
- Thông báo thành công.
- Hiển thị lỗi rõ ràng.

QUEUE EXPERIENCE:
- Bài hiện tại nổi bật.
- Các bài tiếp theo dễ quan sát.
- Hiển thị thứ tự.
- Hiển thị người yêu cầu.
- Vote nhanh.
- Không cần reload.
- Thay đổi có animation nhẹ.
- Optimistic UI có rollback.

JOIN EXPERIENCE:
- Quét QR.
- Mở link.
- Nhập tên.
- Tham gia.
- Không yêu cầu thiết lập phức tạp.

HOST EXPERIENCE:
- Player lớn.
- Điều khiển dễ sử dụng.
- Trạng thái rõ ràng.
- QR code dễ tìm.
- Có thể dùng fullscreen dashboard nhưng vẫn
  tuân thủ yêu cầu hiển thị player YouTube.
- Có phím tắt khi focus phù hợp.
- Không tranh phím tắt với iframe/form input.

TOAST MESSAGES:
- Đã thêm bài.
- Đã vote.
- Bài đã tồn tại.
- Phòng đã đầy.
- Bạn đã đạt giới hạn.
- Đã mất kết nối.
- Đang kết nối lại.
- Chủ phòng đã bỏ qua bài.
- Không thể phát video.
- Cần kích hoạt phát nhạc.

Tất cả nội dung hiển thị bằng tiếng Việt tự nhiên.

========================================================
PHẦN 15 — PERFORMANCE OPTIMIZATION
========================================================

Frontend:
- Route-based code splitting.
- Lazy loading.
- Image lazy loading.
- Caching.
- Memoization có chọn lọc.
- Virtualization cho danh sách dài khi cần.
- Giảm bundle size.
- Không import thư viện nặng không cần thiết.
- Không gây rerender toàn trang khi đổi một vote.
- Mobile performance tốt.

Backend:
- Validation sớm.
- Rate limiting.
- Efficient database queries.
- Indexes.
- Pagination.
- Batch operations.
- Không N+1 queries.
- Không giữ state quan trọng trong Worker memory.
- Timeouts.
- Retry với backoff khi phù hợp.

Realtime:
- Không polling liên tục.
- Không gửi toàn bộ queue cho mọi thay đổi nhỏ
  nếu không cần.
- Snapshot theo version.
- Giới hạn event frequency.
- Không broadcast dữ liệu nhạy cảm.

TARGET:
- Giao diện phản hồi nhanh trong điều kiện mạng tốt.
- Hoạt động mượt với 30 người cùng sử dụng.
- Lighthouse Performance mục tiêu >= 90
  trên các trang phù hợp, khi môi trường cho phép.
- Accessibility mục tiêu >= 90.
- Không có lỗi console nghiêm trọng.

Đây là mục tiêu kiểm thử, không được tự nhận đạt
nếu chưa đo thực tế.

========================================================
PHẦN 16 — RELIABILITY
========================================================

Hệ thống phải chịu được:
- Internet chập chờn.
- Refresh trình duyệt.
- Host reconnect.
- Member reconnect.
- API timeout.
- YouTube video errors.
- Concurrent mutations.
- Database temporary outage.
- Realtime disconnection.
- Cloudflare Worker redeployment.
- Supabase temporary unavailability.

BẮT BUỘC:
- Error boundary.
- Retry phù hợp.
- Retry giới hạn.
- Exponential backoff.
- Operation idempotency.
- Consistent database state.
- Reconnect resync.
- Health endpoint.
- Diagnostics.
- Structured logs.
- Safe error messages.
- Graceful degradation.

Khi một bên mất kết nối:
- Không mất queue.
- Không tự tạo bài phát trùng.
- Không đánh dấu thành công khi chưa commit.
- Có trạng thái thông báo rõ.

Free-tier services có thể bị giới hạn hoặc tạm dừng.
Không giả định 100% uptime.

Phân biệt:
- Server online.
- Host connected.
- Player ready.
- Audio actually playing.

========================================================
PHẦN 17 — SECURITY HARDENING
========================================================

Thực hiện security review toàn diện.

Bao gồm:
- Authentication bypass.
- Authorization bypass.
- Room access bypass.
- RLS misconfiguration.
- SQL injection.
- XSS.
- CSRF.
- Rate-limit bypass.
- Brute force PIN.
- Forged realtime events.
- Session hijacking.
- Token leakage.
- Secret exposure.
- Privilege escalation.
- Queue manipulation.
- Unauthorized playback commands.

YÊU CẦU:
- Server validates identity.
- Server validates permissions.
- RLS on sensitive tables.
- Private realtime policies.
- No service-role secrets in frontend.
- No arbitrary SQL from clients.
- No unvalidated YouTube URL fetching.
- No trusting client votes or positions.
- No public admin registration by default.
- Audit logs.
- Configurable limits.
- Safe production error responses.
- HTTP security headers tương thích YouTube.

Nếu có direct Supabase queries từ frontend:
chỉ cho phép qua các RLS policies đã được kiểm thử.

========================================================
PHẦN 18 — DATABASE BACKUP & RESTORE
========================================================

Ứng dụng phải có cơ chế backup và recovery.

- SQL migrations.
- Schema versioning.
- Export dữ liệu.
- Backup instructions.
- Safe restore.
- Migration rollback strategy.
- Production data preservation.

Nếu free tier không có automatic managed backups:
- Tạo script backup phù hợp với Supabase CLI/pg_dump.
- Hướng dẫn chạy định kỳ trên thiết bị hoặc CI
  được cấp quyền.
- Không khẳng định backup tự động đang hoạt động
  nếu chưa cấu hình scheduler và nơi lưu trữ.
- Không đưa database credentials vào source control.
- Có restore test trên database thử nghiệm.

Phải có tài liệu về:
- Schema changes.
- Data recovery.
- Backup rotation.
- Restore verification.
- Deployment rollback.

========================================================
PHẦN 19 — PROJECT STRUCTURE
========================================================

Tạo repository có cấu trúc gọn và rõ.

Đề xuất:

roomtune/
  src/
    client/
      app/
      routes/
      components/
        ui/
        layout/
        music/
        queue/
        room/
        player/
      features/
        auth/
        rooms/
        members/
        search/
        queue/
        voting/
        playlists/
        favorites/
        history/
        host/
        admin/
        settings/
      hooks/
      lib/
      styles/
      types/

    server/
      index.ts
      api/
      middleware/
      services/
      repositories/
      validators/
      auth/
      integrations/
        supabase/
        youtube/
      utils/

    shared/
      schemas/
      contracts/
      constants/
      types/

  supabase/
    migrations/
    seed.sql
    tests/

  tests/
    unit/
    integration/
    e2e/
    security/
    performance/

  docs/
    PLAN.md
    ARCHITECTURE.md
    DATABASE.md
    API.md
    DESIGN_SYSTEM.md
    USER_GUIDE.md
    ADMIN_GUIDE.md
    SECURITY.md
    TESTING.md
    DEPLOYMENT.md
    OPERATIONS.md
    TROUBLESHOOTING.md
    PROGRESS.md

  scripts/
  public/
  .github/workflows/
  .env.example
  .gitignore
  wrangler.jsonc
  vite.config.ts
  package.json
  tsconfig.json
  README.md

Có thể thay đổi nếu phù hợp với tooling mới nhất.

Không tạo cấu trúc phức tạp không cần thiết.

========================================================
PHẦN 20 — API DESIGN
========================================================

Thiết kế versioned REST API.

/api/v1/auth
/api/v1/rooms
/api/v1/members
/api/v1/queue
/api/v1/votes
/api/v1/playback
/api/v1/playlists
/api/v1/favorites
/api/v1/history
/api/v1/youtube
/api/v1/settings
/api/v1/admin
/api/v1/system

Mỗi endpoint có:
- Request validation.
- Authentication.
- Authorization.
- Typed response.
- Error handling.
- Suitable rate limiting.
- Tests.

Tạo error code nhất quán.

Ví dụ:
- ROOM_NOT_FOUND
- ROOM_LOCKED
- ROOM_FULL
- INVALID_PIN
- PERMISSION_DENIED
- QUEUE_FULL
- SONG_ALREADY_QUEUED
- SONG_TOO_LONG
- VIDEO_UNAVAILABLE
- YOUTUBE_QUOTA_EXCEEDED
- HOST_NOT_CONNECTED
- PLAYBACK_BLOCKED
- RATE_LIMITED

Frontend phải hiển thị thông báo tương ứng bằng tiếng Việt.

========================================================
PHẦN 21 — TESTING STRATEGY
========================================================

Viết automated tests thật.

UNIT TESTS:
- YouTube URL parsing.
- Queue ordering.
- Voting rules.
- Queue limits.
- Room access.
- Permission checks.
- Playback state machine.
- Retry logic.
- Validation.
- Error mapping.

INTEGRATION TESTS:
- Supabase authentication.
- Database migrations.
- RLS policies.
- Join room.
- Add song.
- Remove song.
- Vote.
- Reorder.
- Concurrent mutations.
- Admin operations.
- Queue persistence.
- Next-track transaction.
- Playback event idempotency.

E2E TESTS:
- Landing page.
- Admin login.
- Room creation.
- Join room.
- Search UI.
- Add song by URL.
- Add from results.
- Vote.
- Remove own song.
- Host controls.
- Playlist.
- Favorites.
- History.
- Settings.
- Logout.
- Mobile navigation.
- Error states.

REALTIME TESTS:
- Multiple clients.
- Queue updated.
- Member presence.
- Reconnect.
- Missed event recovery.
- Duplicate event.
- Stale version.
- Host handover.

LOAD TEST:
- 30 simultaneous users.
- Multiple song requests.
- Concurrent voting.
- Frequent reconnects.
- Observe database consistency.

YOUTUBE:
- Có PlayerAdapter để mock trong tests.
- Real YouTube smoke test thực hiện riêng.
- Không dùng mocked player để tuyên bố rằng
  playback thật đã được xác minh.

SECURITY TESTS:
- Member cannot pause music.
- Member cannot modify another room.
- Banned member cannot join.
- Anonymous user cannot become admin.
- Unauthorized realtime subscription is rejected.
- Client cannot overwrite vote counts.
- Client cannot forge playback completion.

QUALITY COMMANDS:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm test:e2e

Chỉ ghi PASS khi lệnh đã thực sự chạy thành công.

========================================================
PHẦN 22 — DEPLOYMENT
========================================================

Mục tiêu:
Deploy dễ dàng và ưu tiên gói miễn phí.

HOSTING:
Cloudflare Workers + Static Assets.

DATABASE/AUTH/REALTIME:
Supabase.

Cần tạo:

- wrangler.jsonc.
- Cloudflare deployment scripts.
- Environment validation.
- Supabase migrations.
- Supabase RLS policies.
- Seed development data.
- CI pipeline.
- Production configuration.
- Deployment smoke tests.

ENVIRONMENT VARIABLES:

Ví dụ:
- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY (server only, nếu thực sự cần)
- YOUTUBE_API_KEY (server only)
- APP_BASE_URL
- OTHER_CONFIG_AS_NEEDED

Kiểm tra tên key thực tế theo SDK hiện hành.
Không sử dụng deprecated credentials nếu có lựa chọn mới.

HƯỚNG DẪN:
1. Tạo Supabase project.
2. Cấu hình anonymous auth.
3. Cấu hình admin login.
4. Chạy migrations.
5. Cấu hình RLS.
6. Cấu hình Realtime policies.
7. Cấu hình Cloudflare Worker.
8. Điền secrets.
9. Cấu hình YouTube Data API.
10. Build.
11. Deploy.
12. Smoke test.
13. Tạo phòng đầu tiên.
14. Mở host dashboard.
15. Kết nối loa và bắt đầu phát.

Không cần mua domain để chạy cơ bản.

Nếu môi trường Codex chưa được cấp credentials:
chuẩn bị đầy đủ rồi báo chính xác thao tác cần thực hiện.

Không tự ý bật paid services.

========================================================
PHẦN 23 — MAINTAINABILITY
========================================================

Code phải dễ hiểu và mở rộng.

YÊU CẦU:
- Clear naming.
- Small focused modules.
- Strict typing.
- Shared contracts.
- Reusable components.
- No duplicated business logic.
- No massive single-file components.
- No hardcoded configuration.
- No unnecessary abstractions.
- No premature microservices.
- Consistent error handling.
- Consistent logging.
- Document important architecture decisions.

Dự kiến có thể phát triển thêm:
- Google login.
- Member accounts.
- Public/private playlists.
- Multiple organizations.
- PWA.
- Advanced analytics.
- Room invitations.
- QR check-in.
- Additional music providers nếu được phép.

Không triển khai các tính năng chưa cần nhưng hãy
thiết kế nền tảng để sau này thêm thuận lợi.

========================================================
PHẦN 24 — PHASE-BY-PHASE IMPLEMENTATION
========================================================

PHASE 0 — RESEARCH & ARCHITECTURE
- Inspect repository.
- Check environment.
- Verify official docs.
- Design architecture.
- Define requirements.
- Define data model.
- Define API contracts.
- Define security model.
- Define test strategy.
- Write docs/PLAN.md.

PHASE 1 — PROJECT FOUNDATION
- Initialize project.
- Install dependencies.
- Configure TypeScript.
- Configure Tailwind.
- Configure Hono.
- Configure Vite.
- Configure Cloudflare.
- Configure Supabase client.
- Configure lint/test/build scripts.

PHASE 2 — DESIGN SYSTEM
- Brand identity.
- Colors.
- Typography.
- Layout.
- Components.
- Theme.
- Responsive system.
- Loading/error/empty states.

PHASE 3 — DATABASE & AUTH
- Tables.
- Migrations.
- RLS.
- Anonymous auth.
- Admin auth.
- Room access.
- Permissions.
- Tests.

PHASE 4 — ROOMS & MEMBERS
- Room creation.
- Join flow.
- PIN.
- QR.
- Member management.
- Room settings.
- Moderation.

PHASE 5 — YOUTUBE INTEGRATION
- Search.
- URL parser.
- Metadata.
- Validation.
- API errors.
- Quota protection.
- Player integration.

PHASE 6 — QUEUE ENGINE
- Atomic enqueue.
- Delete.
- Reorder.
- Voting.
- Queue modes.
- Persistence.
- History.
- Concurrency tests.

PHASE 7 — REALTIME & PLAYBACK
- Broadcast.
- Private channels.
- Presence.
- Host state.
- Player state machine.
- Automatic next track.
- Reconnect.
- Failure recovery.

PHASE 8 — COMPLETE FRONTEND
- Landing page.
- Join room.
- Member dashboard.
- Host dashboard.
- Admin dashboard.
- Settings.
- User profile.
- Playlists.
- Favorites.
- History.

PHASE 9 — POLISH & ACCESSIBILITY
- Responsive refinements.
- Animations.
- Keyboard support.
- Accessibility.
- Error UX.
- Empty states.
- Loading UX.
- Performance.

PHASE 10 — SECURITY & HARDENING
- Security review.
- RLS tests.
- Rate limiting.
- Error handling.
- Monitoring.
- Logging.
- Recovery.
- Anti-abuse.

PHASE 11 — TESTING & BUG FIXING
- Unit tests.
- Integration tests.
- E2E tests.
- Realtime tests.
- Load tests.
- Browser testing.
- Fix regressions.

PHASE 12 — DEPLOYMENT & OPERATIONS
- Build production.
- Cloudflare configuration.
- Supabase production setup.
- Deployment.
- Backup.
- Restore.
- Healthcheck.
- Deployment documentation.

PHASE 13 — FINAL QUALITY AUDIT
- Check all features.
- Check all permissions.
- Check all routes.
- Check all UI actions.
- Check all forms.
- Check database consistency.
- Check responsive behavior.
- Check player integration.
- Check build.
- Check tests.
- Check deployment.
- Document remaining risks.

Sau mỗi phase:
1. Chạy test phù hợp.
2. Sửa lỗi.
3. Cập nhật PROGRESS.md.
4. Ghi rõ phần đã xác minh.
5. Tiếp tục phase tiếp theo.

Không dừng chỉ vì một phase đã hoàn thành.

========================================================
PHẦN 25 — DEFINITION OF DONE
========================================================

Chỉ có thể kết luận sản phẩm hoàn thành khi:

[ ] Website chạy được.
[ ] Build production thành công.
[ ] Giao diện đẹp và responsive.
[ ] Dark/light mode hoạt động.
[ ] Thành viên tham gia phòng được.
[ ] Admin đăng nhập được.
[ ] Phân quyền hoạt động.
[ ] Tạo và quản lý phòng được.
[ ] QR code hoạt động.
[ ] Tìm kiếm YouTube hoạt động.
[ ] Thêm bài bằng link hoạt động.
[ ] Queue hoạt động.
[ ] Voting hoạt động.
[ ] Reorder hoạt động.
[ ] Chống trùng hoạt động.
[ ] Host phát YouTube bằng player thật.
[ ] Play/Pause/Next hoạt động.
[ ] Tự chuyển bài khi được browser cho phép.
[ ] Autoplay blocked được xử lý.
[ ] Video lỗi không làm hỏng queue.
[ ] Realtime đồng bộ đúng.
[ ] Reconnect hoạt động.
[ ] Queue không mất sau reload.
[ ] Queue không mất sau Worker deploy.
[ ] Chỉ một active host controller.
[ ] Playlist hoạt động.
[ ] Favorites hoạt động.
[ ] History hoạt động.
[ ] Admin settings hoạt động.
[ ] Moderation hoạt động.
[ ] RLS tests pass.
[ ] Security tests pass.
[ ] Concurrent queue tests pass.
[ ] TypeScript check pass.
[ ] Lint pass.
[ ] Unit tests pass.
[ ] Integration tests pass.
[ ] E2E tests pass.
[ ] Không có nút giả.
[ ] Không còn lỗi blocking đã biết.
[ ] Không leak secrets.
[ ] Có hướng dẫn cài đặt.
[ ] Có hướng dẫn deploy.
[ ] Có backup/restore instructions.
[ ] Có healthcheck.
[ ] Có documentation.
[ ] Những giới hạn chưa kiểm chứng được ghi rõ.

Không tích vào checklist nếu chưa thực sự xác minh.

========================================================
PHẦN 26 — FINAL DELIVERABLE
========================================================

Kết quả cuối phải có:

1. Toàn bộ source code.
2. Database migrations.
3. Production configuration.
4. Hoàn chỉnh frontend và backend.
5. Giao diện có thể dùng thực tế.
6. Automated tests.
7. CI configuration.
8. Deployment scripts.
9. README tiếng Việt.
10. ADMIN_GUIDE.md.
11. USER_GUIDE.md.
12. DEPLOYMENT.md.
13. OPERATIONS.md.
14. SECURITY.md.
15. PROGRESS.md.
16. Final verification report.

Trong báo cáo cuối, trình bày:
- Những tính năng đã hoàn thành.
- Những bài test đã chạy và kết quả.
- Những tính năng chưa xác minh.
- Những vấn đề còn tồn tại.
- Cách chạy local.
- Cách deploy.
- Cách kết nối Supabase.
- Cách cấu hình YouTube API.
- Cách sử dụng bằng điện thoại.
- Cách vận hành máy host.
- Cách backup và restore.
- Những giới hạn của free tier.
- Những giới hạn của YouTube/browser.

Không giả định đã deploy thành công khi chưa thực hiện.

========================================================
PHẦN 27 — QUY TẮC TỰ TIẾP TỤC
========================================================

Tạo ngay:
- docs/PLAN.md
- docs/PROGRESS.md
- docs/DECISIONS.md

PROGRESS.md phải theo dõi:
- Phase hiện tại.
- Task hoàn thành.
- Task đang làm.
- Task còn lại.
- Các test đã chạy.
- Lỗi đang tồn tại.
- Files thay đổi.
- Vấn đề cần user can thiệp.

Khi mất context hoặc bắt đầu phiên mới:
- Đọc các file trên.
- Inspect current repository.
- Kiểm tra git diff.
- Kiểm tra build/test.
- Tiếp tục từ phần chưa hoàn thành.
- Không khởi tạo lại.
- Không ghi đè code đang hoạt động.
- Không mất dữ liệu.

Nếu cần quyền truy cập Cloudflare, Supabase hoặc
YouTube API, chỉ dừng phần phụ thuộc quyền đó.
Tiếp tục những phần có thể thực hiện độc lập.

Không yêu cầu tôi quyết định các chi tiết UI thông thường.
Hãy tự đưa ra quyết định thiết kế chuyên nghiệp.

========================================================
PHẦN 28 — START NOW
========================================================

BẮT ĐẦU NGAY.

Hãy thực hiện tuần tự:

1. Inspect working directory và môi trường.
2. Kiểm tra tài liệu chính thức hiện hành.
3. Tạo implementation plan chi tiết.
4. Chốt database schema và API contracts.
5. Thiết lập repository và tooling.
6. Xây backend và database.
7. Xây design system chất lượng cao.
8. Xây toàn bộ các màn hình.
9. Tích hợp YouTube.
10. Xây queue, voting và realtime.
11. Tích hợp authentication và authorization.
12. Hoàn thiện admin, playlist, favorites, history.
13. Chạy kiểm thử.
14. Sửa lỗi.
15. Tối ưu giao diện và hiệu năng.
16. Chuẩn bị và thực hiện deployment khi có quyền.
17. Chạy final audit.
18. Báo cáo kết quả đã xác minh.

Hãy ưu tiên chất lượng thực tế, tính ổn định,
trải nghiệm người dùng và khả năng bảo trì.

KHÔNG CHỈ TRẢ LỜI BẰNG PLAN.

HÃY TRỰC TIẾP XÂY DỰNG ROOMTUNE.

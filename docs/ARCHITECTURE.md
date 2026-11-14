# Kiến trúc

Một repository, modular monolith. `src/client` React SPA; `src/server/index.ts` Hono REST/composition root; `src/server/ports.ts` RoomStore/IdentityPort; `src/server/repository.ts` Supabase adapter; `src/server/youtube.ts` YouTubePort/YouTubeService; `src/shared` contracts và pure domain logic. HostPlayer dùng YouTube IFrame API; các player fixtures chỉ tồn tại trong tests.

Request → Hono body/origin validation → Supabase Auth getUser(token) → durable rate-limit RPC → domain authorization → SQL transaction → commit → DB broadcast → client invalidates snapshot theo version. Không dùng thông báo broadcast làm dữ liệu chính. Query refetch khi reconnect, focus/online, không polling queue liên tục.

API cùng origin, Bearer token. Worker dùng Supabase secret để gọi RPC chỉ dành service_role; SQL nhận actor đã được backend xác minh và kiểm tra membership/role. Clients không có quyền gọi các RPC này trực tiếp, không thể tự điền actor. RLS phòng vẫn bảo vệ direct reads. Không lưu credentials trong frontend trừ URL/publishable key.

Queue transaction khóa row phòng. Idempotency receipt khóa advisory theo actor/request. Next yêu cầu controller/fence/lease/run trùng; commit chuyển một bài cũ và chọn một bài mới. Unique partial index chỉ cho một entry PREPARING/PLAYING mỗi phòng. Host tự pause khi không gia hạn lease, server từ chối host cũ.

`src/server/services` có AuthService, RoomService, MemberService, QueueService, VotingService, PlaybackService, PlaylistService, SettingsService, SearchService và MaintenanceService. Chúng nhận interfaces thay vì Hono/Cloudflare bindings hoặc SupabaseClient. RoomCommandService dispatch theo command type; các quy tắc cần atomicity vẫn nằm trong PostgreSQL RPC. Không tách read/modify/write thành nhiều transaction. RealtimeService phía client là adapter private Broadcast/Presence; chỉ nhận version và gọi resync.

Frontend tải Access và các màn hình phòng theo chunk. TanStack Query cache response; vote cập nhật optimistic và rollback/invalidate khi lỗi. Các mutations còn lại chờ commit rồi invalidate. Realtime presence chỉ dùng số người online; không dùng làm bằng chứng quyền hay trạng thái âm thanh.

API retry tối đa 2 lần sau lần đầu, exponential backoff+jitter, request body/key không đổi; chỉ read và mutations có receipt. Join/delete/permission/quota không replay tự động. TanStack không nhân thêm retry. Mutation response có version cũ không ghi đè playback mới. Heartbeat lưu vị trí chỉ khi run ID trùng; watchdog tính deadline từ lúc gửi để không cộng thêm thời gian trễ mạng.

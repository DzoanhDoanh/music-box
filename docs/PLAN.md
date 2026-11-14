# ROOMTUNE — Kế hoạch triển khai

Ngày bắt đầu: 13/11/2026. MusicBox được người dùng miễn quy trình PMP.

## Các giai đoạn và tiêu chí

0. Khảo sát: thư mục trống, Node 24, pnpm 11; Docker chưa chạy. Đối chiếu tài liệu chính thức.
1. Nền tảng: React/Vite strict TS, Hono Worker, Tailwind, ESLint, Vitest, Playwright, lockfile.
2. Thiết kế: nền graphite/violet, dark/light, component accessible, mobile 320px, empty/error/loading/offline.
3. Database/auth: migrations, membership RLS, anonymous auth, admin do operator cấp, private channels.
4. Phòng: tạo, tham gia, PIN, QR, giới hạn, moderation, settings.
5. YouTube: API server, validation metadata, URL parser, quota errors, player hiển thị thật.
6. Queue: RPC khóa phòng, idempotency, version, FIFO/voting/fair/manual, votes/reorder/history.
7. Playback/realtime: lease và fencing, run ID, next atomic, reconnect snapshot, broadcasts từ DB.
8. Frontend: landing/join/login/rooms/dashboard/host/admin/settings/profile/library.
9. Polish: responsive, keyboard, focus, reduced motion, lỗi và thông báo tiếng Việt.
10. Hardening: phân quyền đa lớp, rate limit bền vững, audit, secrets, headers.
11. Tests: unit/API/SQL/security/E2E/concurrency; ghi rõ test fixture và dịch vụ thật.
12. Vận hành: CI, deploy scripts, backup/restore, hướng dẫn tiếng Việt.
13. Audit: chạy các quality commands; không xác nhận deploy hoặc playback thật nếu chưa kiểm tra.

## Kết quả hiện tại

Bổ sung vào lại phòng 14/11/2026: thẻ Vào lại phòng trên trang chủ/Join/Login, danh sách ưu tiên phòng vừa nghe, khôi phục phiên đã lưu, phân biệt Rời phòng với Quên phiên. Không tự tạo identity trong API nền. Đã kiểm chứng trình duyệt desktop/mobile và HTTPS thật; xem PROGRESS/PUBLIC_CHECK.

Bổ sung 14/11/2026: triển khai hai chế độ phát `HOST_ONLY` / `ALL_DEVICES`, follower có player chính thức và điều khiển nghe riêng; nút Rời phòng rõ trên mobile/desktop. Host vẫn là bộ điều khiển duy nhất. Xem PROGRESS và HOSTED_CHECK cho các kiểm thử mới.

Các phần source/local đã triển khai; kiểm thử và giới hạn bằng chứng ở TESTING.md và FINAL_AUDIT.md. Đã có các service interfaces, retry/idempotency, CAPTCHA, account lifecycle, backup/restore rehearsal, axe và Lighthouse local. Supabase hosted đã migrate và kiểm thử thật cùng YouTube API qua Hono local (HOSTED_CHECK.md). Cloudflare deployment, 30 browser WebSocket và playback/âm thanh thật vẫn chưa hoàn tất.

## Kiến trúc dự kiến

React SPA gọi API cùng origin bằng Bearer access token Supabase. Hono xác minh token với Auth; RPC chỉ service_role gọi được và nhận actor từ token đã xác minh. Database kiểm tra quyền actor và khóa row phòng để serialize queue mutations. Service secret chỉ Worker, không đưa vào client. Realtime chỉ thông báo invalidation/version, snapshot đọc lại qua API. Mọi quyền vẫn kiểm tra trong SQL.

## Phụ thuộc bên ngoài

Supabase URL/publishable key/server secret và YouTube key đã được cấp trong các file local bị Git ignore. Còn cần Cloudflare account/quyền deploy và Turnstile trước public rollout. Không tạo dịch vụ trả phí hoặc tự publish sang nơi khác.

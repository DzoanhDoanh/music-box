# Báo cáo bàn giao ROOMTUNE — 13/11/2026

## Cập nhật 14/11/2026

Đã bổ sung hai chế độ phát chỉ host/tất cả thiết bị và nút Rời phòng trên desktop/mobile; migration mới đã áp dụng lên hosted. Kết quả hiện tại: 62 unit/API/React, 25 PostgreSQL và các ca room E2E liên quan đã đạt (18 ca desktop/mobile, gồm lượt chạy lại lỗi nhãn/focus sau sửa). Hosted kiểm thử 12 bước, có hai YouTube IFrames thật cùng tăng thời gian và theo pause/resume, rời phòng/release host. Xem `HOSTED_CHECK.md` và `PROGRESS.md` cho bằng chứng và giới hạn. Chưa xác nhận âm thanh trên hai thiết bị vật lý; không cam kết đồng bộ chính xác khi có quảng cáo. Build/lint/typecheck/secret scan đạt. Tunnel đang tắt theo yêu cầu người dùng, chưa deploy Workers production.

Các phần dưới đây là báo cáo lịch sử ngày 13/11.

## Kết quả

Đã triển khai source frontend/backend/database, migrate Supabase hosted và kiểm thử Auth/RLS/private Realtime/queue/YouTube API thật qua Hono local. **Chưa đủ bằng chứng để tuyên bố production-ready hoặc hoàn thành toàn bộ Definition of Done:** còn Cloudflare deployment, âm thanh/IFrame, CAPTCHA, tải 30 browser clients và vận hành hosted. Không push, không deploy Cloudflare, không bật gói trả phí. MusicBox được miễn PMP theo xác nhận của người dùng.

## Tính năng đã có

- Giao diện Việt, dark/light, responsive từ 320px; landing, join/login, danh sách phòng, dashboard thành viên/host/admin, QR, trạng thái loading/error/empty/offline và focus/keyboard.
- Anonymous/email Auth adapters, Turnstile tùy chọn, JWT identity phía server, membership/role checks trong SQL, RLS/private channels, PIN bcrypt, rate limit bền vững, audit.
- FIFO/VOTING/FAIR/MANUAL, vote/unvote optimistic có rollback, approval/reject, limits, duplicates, remove/clear/reorder; transactions/idempotency/version và unique active entry.
- YouTube API chính thức: server search/metadata/cache/quota/URL validation; player nhìn thấy, controls/autoplay/error/seek/volume/phím tắt; lease/fencing/run ID, heartbeat/resume/watchdog và bỏ sự kiện cũ. Player giữ nguyên khi đổi tab; có nhả quyền host.
- Favorites, playlist CRUD và batch tối đa 20, history/audit pagination, profile/export/xóa account, đổi mã phòng. Owner account cần operator chuyển quyền trước khi xóa.
- Service interfaces tách khỏi Hono/Supabase adapter; SQL giữ ranh giới giao dịch. Migrations, env samples, CI, deployment/backup/smoke scripts, metadata maintenance cron và docs vận hành.

## Bằng chứng đã chạy

| Phạm vi                                  | Kết quả                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Strict TypeScript, ESLint 10             | PASS                                                               |
| Unit/API/React                           | **54 PASS**                                                        |
| PostgreSQL integration                   | **23 PASS**, gồm 30 enqueue/vote đồng thời và backup/restore thật  |
| Public/Room E2E                          | **12 + 12 PASS**, desktop/mobile; room dùng fixtures               |
| Axe accessibility                        | Không có violation WCAG A/AA trên các màn hình đã quét             |
| Lighthouse landing local                 | Performance **100**, Accessibility **100**, Best Practices **100** |
| Build Worker/SPA                         | PASS                                                               |
| Client artifact secret-pattern scan      | PASS, 12 files; heuristic                                          |
| Production dependency audit / peer check | Không có advisory đã biết / PASS                                   |

Xem TESTING.md và Lighthouse reports để biết điều kiện đo. Đã kiểm tra ảnh desktop/mobile. Local built Worker trả 200, áp dụng CSP và Referrer-Policy; health báo thiếu cấu hình đúng thực tế. CI mới có workflow, chưa chạy trên GitHub.

## Những phần chưa xác minh

1. Mở rộng kiểm tra channel revocation cache với kết nối đang mở, mất mạng/missed events và vận hành lâu dài. Auth/JWT, private Broadcast/Presence và chặn reconnect sau kick đã đạt trong lượt hosted (HOSTED_CHECK.md).
2. Âm thanh qua IFrame trên máy nối loa, autoplay/quảng cáo/errors/handover; CAPTCHA cần cấu hình Supabase Auth + Turnstile site/secret. YouTube Data API metadata/search thật đã đạt; chưa thử ép cạn quota thật.
3. Cloudflare deployed Static Assets/CSP/cron/CPU và queue qua lần deploy/rollback. Cần account, URL đích và quyền deploy.
4. 30 browser/WebSocket clients thật, failover stress, Supabase hosted restore và vận hành dài ngày. Các schema managed Auth/Realtime trong DB test là fixtures.
5. Kiểm tra screen reader thủ công và security assessment độc lập. Secret scan không chứng minh tuyệt đối không có lộ lọt trong cấu hình tương lai.

Không có lỗi blocking tái hiện trong phạm vi các kiểm thử local đã chạy. Vẫn có cảnh báo annotation Zod upstream khi build; không bị bỏ qua hoặc tắt. Free tier/metadata retention/anonymous recovery có giới hạn được mô tả trong SECURITY và OPERATIONS.

## Chạy local và triển khai

Node >=22.12, pnpm 11.25.0. `pnpm install --frozen-lockfile`, sao chép .env.example → .env và .dev.vars.example → .dev.vars, điền keys rồi `pnpm dev` tại http://localhost:5173. Chưa có keys vẫn xem landing/forms/theme, API trả thông báo cấu hình; không thể vào phòng thật.

DEPLOYMENT.md hướng dẫn Supabase, private realtime, cấp admin, YouTube Data API và Worker secrets. Đã thực hiện migrate cả 4 file và cấp admin cho tài khoản người dùng chỉ định. Email provider và anonymous đang bật; không có đăng ký quản trị công khai và system_admins vẫn là nguồn quyền duy nhất. Chỉ `pnpm deploy` khi có quyền Cloudflare.

Điện thoại mở URL HTTPS hoặc quét QR → nhập tên/PIN → tìm bài/vote. Máy nối loa mở Máy phát nhạc → Nhận quyền → Phát; giữ browser hoạt động, cho phép autoplay bằng thao tác thật nếu cần. Hàng chờ cùng màn hình host; Dừng máy phát nhả lease. Không hứa phát nền khi browser đóng, không bỏ quảng cáo hoặc trích âm thanh.

Backup: cấu hình PG\* environment bảo mật và chạy scripts/backup.ps1; restore vào DB riêng theo OPERATIONS.md. Đã rehearsal PostgreSQL local, chưa backup scheduler hoặc restore hosted. Free-tier quotas và giới hạn YouTube/browser có liên kết chính thức trong DEPLOYMENT.md; không có cam kết uptime.

## Tiếp tục từ đây

Giữ repository hiện tại, đọc PROGRESS/PLAN/DECISIONS. Bước tiếp theo là cấu hình staging và chạy checklist tích hợp thật ở TESTING.md. Chỉ đánh dấu hoàn thành các mục tương ứng khi có bằng chứng; không suy ra từ mock, fixture hoặc build.

# Triển khai Cloudflare + Supabase

**Phát hành cờ cá ngựa qua tunnel:** bật `VITE_ENABLE_LUDO=true` trong `.env` và
`ENABLE_LUDO=true` trong `.dev.vars`, sau đó build và khởi động lại theo [TUNNEL.md](TUNNEL.md).
Migration `202611140004_ludo.sql` đã áp dụng ngày 14/11; không sửa hoặc reset database.
Tunnel cho phép cả `/room/:id/games` và `/room/:id/games/:match`. Xem [GAME.md](GAME.md).
Preview không chạy cron; deadline được xử lý khi có lượt đọc/lệnh tiếp theo, gồm polling khi mở bàn.

Đã migrate và kiểm thử Supabase hosted cùng YouTube API qua Worker local. Đã mở bản thử qua tunnel tại roomtune.dzoanh.me; xem [TUNNEL.md](TUNNEL.md) để bật/tắt và xem giới hạn. Chưa deploy Cloudflare Workers production. Không cần domain riêng khi dùng workers.dev. Không tự bật gói trả phí.

1. Tạo Supabase project, lưu DB password ngoài repository. Bật Anonymous Sign-ins và Email provider. Với CLI đang dùng, `auth.email.enable_signup=false` tắt cả đăng nhập email và gây `email_provider_disabled`; giữ `true` để chủ phòng đăng nhập. Người dùng đã cho phép thiết lập này. Ứng dụng không có đăng ký quản trị công khai: mọi tài khoản tự tạo đều không có quyền tạo phòng nếu operator chưa cấp `system_admins`. Trước public rollout, tạo Turnstile widget cho domain được phép, đặt secret trong Supabase Auth CAPTCHA và VITE_TURNSTILE_SITE_KEY trong `.env`. Join/login đã có widget chuyển captchaToken vào SDK; không đặt secret Turnstile trong frontend.
2. Local: `pnpm exec supabase start` cần Docker đang chạy; hoặc dùng hosted Supabase. `pnpm exec supabase login`, `pnpm exec supabase link --project-ref ...`, kiểm tra linked project trước `pnpm db:migrate`. Không db reset production.
3. Chạy migrations. Tắt Allow public access trong Realtime settings. Policies trên realtime.messages phải được áp dụng và kiểm tra với hai tài khoản ở hai phòng.
4. Tạo admin qua dashboard Auth; SQL operator: `insert into public.system_admins(user_id) values ('UUID_CỦA_USER_ĐƯỢC_CẤP');`. Không thêm anonymous user. Không đưa mật khẩu vào seed.
5. Điền `.env`: VITE*SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_TURNSTILE_SITE_KEY nếu bật CAPTCHA. Chỉ public values được build vào SPA. Điền `.dev.vars` từ mẫu cho local; không dùng prefix VITE* cho server secret.
6. Tạo Google Cloud project, bật YouTube Data API v3, lấy API key và giới hạn API restriction chỉ YouTube Data API. Key chỉ server. Kiểm tra quota thực trong Console. Không bật billing tự động.
7. `pnpm exec wrangler login` trên tài khoản được phép. Đặt secrets bằng `pnpm exec wrangler secret put SUPABASE_URL`, tương tự SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, YOUTUBE_API_KEY, APP_BASE_URL. Không truyền key qua command argument/log.
8. Chạy lint/format:check/typecheck/test/test:db/build/check:secrets/test:e2e/test:e2e:room. Cloudflare Vite output worker ở dist/roomtune, static ở dist/client; Wrangler dùng generated config. Khi `.dev.vars` tồn tại, plugin sao chép file vào `dist/roomtune/.dev.vars` để preview local: không chia sẻ/đóng gói bản sao secrets này, không dùng cả thư mục dist làm static root. Chỉ dist/client là static assets. GitHub Actions chỉ kiểm tra, không tự deploy.
9. Chỉ sau khi có quyền deploy: `pnpm deploy`. Ghi URL workers.dev trả về; cập nhật APP_BASE_URL và Auth site URL/redirects theo domain thật.
10. `APP_BASE_URL` trong environment rồi `node scripts/smoke.mjs`. Tiếp tục kiểm thử admin login, anonymous join, PIN, queue/vote, private realtime, host playback bằng video được phép, reconnect/handover bằng hai trình duyệt và điện thoại.

Không gọi build/mock tests là xác minh deployment. CSP trong public/\_headers hỗ trợ youtube.com/youtube-nocookie.com và Supabase hosted; custom Supabase domain cần chỉnh allowlist.

## Giới hạn dịch vụ đối chiếu ngày 13/11/2026

- Workers Free: 100.000 dynamic requests/ngày, 10ms CPU mỗi invocation; giới hạn subrequest cần theo dõi. Maintenance giới hạn 20 video/lượt, vẫn cần đo CPU thực trên account đích. Xem [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) và [limits](https://developers.cloudflare.com/workers/platform/limits/).
- Supabase Free: DB 500MB, egress 5GB, 50.000 MAU; project có thể pause sau một tuần không hoạt động, tối đa hai active projects. Cần kiểm tra Realtime connections/messages trong dashboard và tự tổ chức backup. Xem [Supabase pricing](https://supabase.com/pricing).
- Quota YouTube do Google Cloud project cấp; bỏ giới hạn tìm kiếm của ROOMTUNE không thay đổi quota này. ROOMTUNE không còn trần search riêng 6 lần/phút/người hoặc 80 lần/24 giờ; vẫn giữ xác thực, membership, cache và chống spam API chung. Console của project là nguồn quota thực. Xem [giới hạn hiện tại](SEARCH_LIMITS.md) và [YouTube quota](https://developers.google.com/youtube/data/determine_quota_cost).

Không đảm bảo 100% uptime hoặc free-tier đáp ứng mọi quy mô. Không tự bật billing. Lighthouse đã đo trên landing local; xem TESTING.md, không suy ra điểm deployment thật.

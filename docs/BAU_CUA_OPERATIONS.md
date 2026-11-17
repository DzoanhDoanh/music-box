# Thử, phát hành và vận hành Bầu Cua

## Hiện trạng

Đã public ngày 17/11/2026 sau khi người dùng cho phép commit/phát hành.
Migrations 202611170007–009 đã áp dụng; Auth/Realtime/gameplay/hình phạt qua HTTPS
đã đạt [kiểm thử](BAU_CUA_TESTING.md). Vào phòng → Trò chơi → Bầu Cua Party.
Public 4173 và trial Ludo 5180 dùng chung Supabase: **đổi port không tự cô lập database**.

Backup trước migration: `backups/before-bau-cua-2026-11-17T15-56-05-071Z.dump`,
đã kiểm tra danh mục archive. Bản cũ giữ tại
`.roomtune/releases/bau-cua-20261117T155813/previous`; cấu hình và metadata ở cùng
thư mục ignored. Chỉ `dist/client` được serve; cả hai cờ Bầu Cua đã bật.

Không chạy npm run deploy/wrangler deploy hoặc build đè live dist trong quy trình
này. Giữ runtime cục bộ qua Cloudflare Tunnel; không tự chuyển hạ tầng hoặc bật gói phí.

## Thử không đụng dữ liệu thật

    pnpm test:db:bau
    pnpm exec playwright test --config playwright.bau.config.ts --headed
    pnpm build:bau

Headed chạy kịch bản rồi đóng, không phải server chơi lâu dài. Gameplay dùng
PostgreSQL thật 55439; Auth/transport/YouTube là fixture. Ảnh tại test-results/bau.
Chỉ `.roomtune/bau-build/client` là static assets. Thư mục `roomtune` bên cạnh có
Worker và có thể chứa bản sao `.dev.vars`: không phục vụ/chia sẻ cả build làm static root.

## Bản thử tích hợp thật

Cần Supabase local/staging riêng hoặc quyền dùng hosted hiện tại. Không tạo dữ
liệu thử trong phòng AE CTV/Nhạc của Doanh.

1. Apply đủ migrations vào DB thử, không reset. Cấu hình Auth và private Realtime,
   tạo hai danh tính và phòng tạm. Không dùng mật khẩu/token người thật trong fixture.
2. Đặt public URL/key DB thử trong `.env.bau-local` (ignored), giữ `.env` hiện tại;
   chạy pnpm build:bau. Client/server phải trỏ cùng project và publishable key.
3. Tạo `.roomtune/bau-trial/wrangler.json`: main là
   `../bau-build/roomtune/index.js`, no_bundle=true, compatibility_date/flags từ
   generated config. Assets.directory chỉ `../bau-build/client`,
   not_found_handling=`single-page-application`, run_worker_first=`['/api/*']`.
   Thêm rules ESModule cho `**/*.js` và `**/*.mjs` như profile game-trial đang có.
4. Đặt secrets của DB **thử** trong `.roomtune/bau-trial/.dev.vars`, không tự copy
   credentials production. Đặt ENABLE_BAU_CUA=true và
   APP_BASE_URL=http://127.0.0.1:5181. Giữ nguyên `.dev.vars` các runtime hiện tại.
5. Kiểm tra 5181 trống rồi chạy Terminal, không cập nhật tunnel:

   $env:X_LOCAL_EXPLORER = 'false'
   node node_modules/wrangler/bin/wrangler.js dev --config .roomtune/bau-trial/wrangler.json --local --ip 127.0.0.1 --port 5181 --inspector-port 0 --persist-to .roomtune/bau-trial/state

6. Mở http://127.0.0.1:5181 → phòng thử → Trò chơi → Bầu Cua. Health chỉ xác nhận
   cấu hình, chưa probe DB. Thử bằng hai danh tính thật. Ctrl+C dừng Terminal thử.
   Nếu chạy nền, ghi và kiểm tra PID/path/start ticks/command trước khi dừng;
   không kill tất cả node/cloudflared.

Đợt phát hành này đã chạy candidate 5181 trên hosted hiện tại sau khi được cho
phép, chỉ tạo phòng/tài khoản thử rồi dọn. Runtime 5181 đã dừng sau nghiệm thu.
Quy trình Supabase staging riêng bên trên vẫn là hướng dẫn cho các đợt sau.

## Phát hành khi được phép

1. Review diff/flags/migrations/project ref đích và chạy checks trong tài liệu kiểm thử.
2. Backup theo [OPERATIONS.md](OPERATIONS.md), scripts/backup.ps1 dùng PG\* trong
   environment bảo mật, không password trong args/chat. Kiểm tra archive và thử
   restore vào DB riêng. Giữ Auth/Realtime config/secrets ngoài Git.
3. Review/apply đủ 007, 008, 009 theo thứ tự khi flags còn tắt; không sửa migrations
   đã áp dụng, không reset hoặc DROP schema production.
4. Trong phòng tạm, kiểm tra Auth, PostgREST RPC, private Broadcast với nhiều tài
   khoản; outsider/ban không đọc/ký kênh; browser không gọi mutation trực tiếp
   hoặc đọc seed sớm. Thử cược, mất cái, retry, ledger/phạt/queue và nhạc thực.
5. Build release riêng, bật cả VITE_ENABLE_BAU_CUA=true và ENABLE_BAU_CUA=true
   trong cấu hình **release mới**. Lưu revision, build ID, runtime cũ; chuyển
   runtime theo [TUNNEL.md](TUNNEL.md). Không build vào thư mục đang phục vụ,
   không thay tunnel khác của máy.
6. Kiểm tra domain trên hai mạng, desktop/mobile, nhạc/Ludo, refresh/reconnect và
   hết coin. Chỉ xác nhận public sau khi kiểm tra thành công.

## Theo dõi và recovery

Ví → Tình trạng đồng bộ có sổ khớp, outbox chờ và lần settlement gần nhất;
dealer panel có collateral. Logs dùng requestId/code, không ghi seed chưa reveal,
JWT, password hoặc secret.

SQL chỉ đọc cho operator:

    select id, table_id, status, deadline, settled_at
    from public.bau_cua_rounds
    where status not in ('RESULT', 'CANCELLED') order by deadline;

    select count(*) as pending, min(created_at) as oldest
    from private.bau_outbox where delivered_at is null;

    select w.user_id from public.coin_wallets w
    left join (select user_id, sum(available_delta) a, sum(reserved_delta) r
               from public.coin_ledger group by user_id) l using (user_id)
    where w.available <> coalesce(l.a,0) or w.reserved <> coalesce(l.r,0);

Không ghi đè ví/xóa outbox để che sai lệch. Pause bàn, lưu round ID/requestId,
đối soát ledger/escrow trước khi sửa bằng migration hoặc điều chỉnh có audit.

Lệnh chưa rõ kết quả dùng **Xác minh thao tác trước** cùng request ID. Sau khi
DB/Realtime phục hồi, đọc/lệnh hợp lệ tiến triển deadline và gửi lại outbox. Không
cần process timer chạy mãi; vắng mọi client có thể để deadline cũ đến lần truy cập sau.

Rollback: tắt nhận bàn/vòng mới bằng cấu hình phòng; để vòng đã nhận cược quyết
toán hoặc hủy an toàn trước reveal. Chờ reserve giải phóng rồi chuyển runtime
cũ với flag tắt. Không tắt toàn API khi coin còn khóa. Giữ ledger/seed/receipt,
sửa schema bằng migration tiến tiếp; chỉ restore thử ở DB riêng, không --clean production.

Ledger/history/receipts Bầu Cua chưa tự prune. Theo dõi dung lượng/outbox, chốt
retention trước khi vận hành lâu dài; không xóa dữ liệu cần cho xác minh/recovery.
Khóa kinh tế chung cần benchmark hosted khi nhiều phòng, không suy SLA/quota từ local.

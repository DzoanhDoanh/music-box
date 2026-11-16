# Chia sẻ ROOMTUNE qua Cloudflare Tunnel

URL: **https://roomtune.dzoanh.me**. Máy Windows này chạy bản build bằng Vite preview/Workers runtime ở `127.0.0.1:4173`; tunnel `roomtune` chuyển tiếp HTTPS vào đó. Supabase hosted giữ dữ liệu, Auth và Realtime. Đây là bản chia sẻ thử từ máy cá nhân, chưa phải deployment Workers production. [Vite preview](https://vite.dev/guide/static-deploy) được thiết kế để xem thử bản build.

## Bật, tắt và kiểm tra

Dependencies đã cài; không cần cài pnpm toàn máy:

```powershell
Set-Location D:\Projects\MusicBox
npm.cmd run public:start
npm.cmd run public:status
```

Script chạy hai tiến trình nền với cửa sổ ẩn. Có thể đóng PowerShell sau khi báo started. Máy phải bật, không sleep và có Internet. Chưa cài tự khởi động cùng Windows; sau khi restart máy hãy chạy lại lệnh start.

```powershell
npm.cmd run public:stop
```

Stop chỉ dừng cây tiến trình ROOMTUNE đã ghi nhận, sau khi kiểm tra PID, đường dẫn executable, thời gian tạo và command line. Không dừng tunnel `dzoanh-tunnel`, ứng dụng khác hoặc xóa dữ liệu Supabase. Trạng thái/log nằm trong `.roomtune/` (Git-ignored).

Khi có thay đổi mã nguồn hoặc `.env`/`.dev.vars`:

Để phát hành đầy đủ game, đặt `VITE_ENABLE_LUDO=true` trong `.env` và `ENABLE_LUDO=true`
trong `.dev.vars`. Migration game đã có trên hosted. Lưu một bản sao `dist` và
`.wrangler/deploy/config.json` vào `.roomtune/releases/` trước build để có thể quay lại.
Các bản sao có thể chứa server secrets; giữ ngoài Git và ngoài thư mục static.

```powershell
npm.cmd run public:stop
npm.cmd run build
npm.cmd run check:secrets
npm.cmd run public:start
```

Trong lúc build/restart, domain tạm không phục vụ. `npm.cmd run dev` vẫn dùng cổng 5173 riêng cho phát triển.

## Cấu hình đang dùng

- Tunnel riêng: `90ac7355-80af-479d-9675-8129094e3583` (`roomtune`). Cấu hình tại `cloudflared.roomtune.yml`; credentials nằm ngoài repo trong hồ sơ Windows, không được chia sẻ.
- DNS CNAME của `roomtune.dzoanh.me` trỏ tunnel trên, bật proxy Cloudflare. Hai ứng dụng của tunnel cũ không thay đổi.
- `APP_BASE_URL` trong `.dev.vars` và Supabase Auth Site URL đều là `https://roomtune.dzoanh.me`; giữ hai URL local cho phát triển.
- Preview chỉ nghe loopback, chỉ cho Host `roomtune.dzoanh.me` cùng localhost/IP theo Vite. Inspector và Local Explorer bị tắt.
- Tunnel chỉ cho `/`, `/join`, `/login`, `/rooms`, `/room/<uuid>`, `/room/<uuid>/games`, `/room/<uuid>/games/<uuid>`, `/privacy`, `/assets/*`, favicon/robots và `/api/v1/*`. Đường dẫn debug, mã nguồn, `.env`, `.dev.vars`, `dist/roomtune` nhận 404. Không serve toàn bộ `dist`.
- Cloudflare Vite sao chép `.dev.vars` vào `dist/roomtune/.dev.vars` cho preview; file này chứa secrets và không phải static asset. Chỉ `dist/client` được phục vụ.

Khi thao tác DNS bằng CLI phải chỉ định `--config cloudflared.roomtune.yml`. CLI trên máy này ưu tiên tunnel trong config mặc định ngay cả khi truyền tên khác; không dùng `--overwrite-dns` với bản ghi chưa đối chiếu.

## Cách dùng sau khi mở được domain

Bản cập nhật lúc 19:19 ngày 16/11/2026 bổ sung danh sách online/offline và sửa tìm kiếm,
thêm link YouTube. Tìm kiếm tự chạy sau khi ngừng gõ 650 ms; hai trần search riêng của
ứng dụng đã bỏ. Bấm **N online** ở thanh đầu để mở danh sách thành viên. Tải lại trang
để dùng giao diện mới. Xem [kiểm tra thành viên](MEMBERS_PUBLIC_CHECK.md) và
[kiểm tra tìm kiếm/link](SEARCH_LINK_PUBLIC_CHECK.md).

Gợi ý nhạc đã phát hành ngày 16/11/2026: vào **Tìm & thêm bài**, để trống ô tìm kiếm để xem
**Nghe lại cùng phòng** và **Khám phá nhạc mới**. Nếu tab đang mở bản cũ, tải lại trang.
Đợt mở rộng cùng ngày bổ sung bốn nguồn **Việt Nam / Mỹ / Hàn Quốc / Nhật Bản**, bộ lọc và
**Xem thêm**; kiểm thử public nhận được 61 bài khám phá trong phòng mới. Số bài thực tế
thay đổi theo dữ liệu nguồn và giới hạn phòng.
Xem [kiểm thử public](RECOMMENDATIONS_PUBLIC_CHECK.md). Lượt này chuyển đúng build đã kiểm tra
ở cổng 5180, chỉ restart preview và giữ nguyên tunnel; chunk cũ được giữ để tab cũ tiếp tục dùng.

Trong phòng nhạc, chọn **Trò chơi → Tạo bàn mới** để chơi cờ cá ngựa. Mời thành viên cùng
phòng bằng link bàn; mỗi người ngồi ghế và bấm sẵn sàng. Xem [GAME.md](GAME.md).
Game lưu deadline trên server; khi bàn mở, polling xử lý hết lượt. Khi không ai mở bàn,
trạng thái bắt kịp vào lần truy cập kế tiếp vì preview không chạy lịch cron Workers.

Chủ phòng đăng nhập tài khoản đã có tại `/login`. Dữ liệu phòng giữ nguyên; session đăng nhập localhost không tự chuyển sang domain mới. Vào phòng từ domain và dùng **Sao chép lời mời** để có link HTTPS cho điện thoại. Link tạo từ localhost vẫn là link local.

Sau lần tham gia đầu tiên, dùng **Rời phòng** để nghỉ nghe. Mở lại cùng domain trên cùng trình duyệt sẽ thấy **Vào lại phòng** ngay ở trang chủ hoặc màn hình nhập mã; **Phòng của bạn** giữ danh sách, đưa phòng vừa nghe lên trước. Thành viên còn phiên có thể theo link mời để vào lại mà không nhập mã/PIN. **Quên phiên trên thiết bị này**, xóa dữ liệu trình duyệt hoặc đổi trình duyệt sẽ cần tham gia/đăng nhập lại.

Trong **Cài đặt phòng → Phát nhạc ở đâu?**, chủ phòng chọn **Chỉ máy host** (mặc định, một máy nối loa) hoặc **Tất cả thiết bị** (mỗi người nhấn **Bật nghe trên thiết bị này**). Máy host vẫn giữ quyền chọn bài/phát/dừng/chuyển bài; âm lượng mỗi người độc lập. Follower cần giữ trang mở và có thể lệch nhịp khi mạng chậm hoặc có quảng cáo. Nút **Rời phòng** luôn ở thanh đầu trang; dừng phiên nghe local, nhả host trên thiết bị đó nếu có và giữ phòng/hàng chờ để quay lại.

## Kiểm chứng và giới hạn

Xem `PUBLIC_CHECK.md`: kiểm thử Auth, tạo/join phòng, quyền truy cập, private Realtime, YouTube API, queue/vote và dọn dữ liệu kiểm thử qua HTTPS. Trang, assets, CSP, API chưa đăng nhập (401), origin lạ (403) và các đường dẫn nội bộ (404) đã đạt.

Lượt kiểm tra HTTPS ban đầu dùng DNS-over-HTTPS Cloudflare riêng trong tiến trình test vì DNS mặc định của máy còn NXDOMAIN. HTTPS đi qua Cloudflare, TLS được xác minh bình thường; không gọi trực tiếp localhost thay cho domain. Sau đó đã thấy trang thật trên Chrome và người dùng xác nhận vào được cả mạng khác. Kết quả nslookup từ mạng từng lỗi trả NXDOMAIN với DNS mặc định nhưng đúng IP khi hỏi 1.1.1.1. Chưa đổi DNS server hoặc sửa hosts của máy. SOA của zone có negative-cache TTL 1800 giây; thời gian cập nhật phụ thuộc resolver. Tunnel từng được tạm tắt, sau đó đã bật lại theo yêu cầu người dùng; các bản sửa ngày 14/11 được cập nhật vào preview đang chia sẻ.

Nếu chưa mở được: thử mạng khác/4G hoặc chờ cache DNS hết hạn. Lỗi DNS khác với Cloudflare 1033 (tunnel tắt) hay 502 (preview tắt). Kiểm tra `npm.cmd run public:status` và log trước khi thay cấu hình.

Turnstile/CAPTCHA chưa cấu hình; chưa kiểm thử tải 30 thiết bị, mất mạng dài ngày hoặc restore hosted. Cron bảo trì không tự chạy như Workers production trong phiên preview này. Muốn dịch vụ chạy độc lập với máy cá nhân, dùng hướng dẫn deployment Workers tại `DEPLOYMENT.md`.

Nguồn: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/), [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/).

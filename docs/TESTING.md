# Kết quả kiểm thử — 13/11/2026

## Voice, vòng quay và menu — bản thử 16/11/2026

- **305 unit/API/React PASS / 32 files**; typecheck/lint/format đạt. PostgreSQL: **63 checks PASS**,
  gồm 9 kiểm tra vòng quay về quyền, khóa đồng thời, replay, bốn chế độ hàng chờ và giữ active run.
- Room/session: **94 ca PASS, 2 SKIP** qua lượt đầy đủ và chạy lại phần liên quan. Lượt đầu
  phát hiện hai lỗi Axe do `aria-controls` dùng ID chứa khoảng trắng; đổi sang ID cố định theo nhóm.
  Lượt xác minh sau sửa **24 PASS, 2 SKIP**. Menu mobile, phiên đăng nhập và playback vẫn đạt.
- Game: **18 PASS, 2 SKIP**. Public entry pages: **12 PASS**. Các skip là viewport đã được bao phủ
  ở project desktop, không phải bỏ qua lỗi.
- Activities: **10 PASS** desktop/mobile: giọng nói opt-in/final transcript/debounce/permission,
  fallback bàn phím, custom draft qua reload, quay có/không thưởng, giữ iframe, lost response
  retry cùng key qua reload, Axe sáng/tối và reduced motion.
- Hosted: run `63e29b9b-b1cf-4946-9746-c0561bf9b2bd`, **4 nhóm kiểm tra PASS** với Auth, Presence,
  API/RPC và hai phiên trình duyệt thật. Có kết quả custom chung; reward TWO_FIRST bỏ qua consent,
  giữ active playback và toàn bộ queue, replay đúng một lượt, Next chọn bài thưởng. Kick chặn cả
  đọc và replay. Hai tài khoản/phòng tạm đã dọn; không sửa phòng thật. Lượt đầu kịch bản thử bị
  API từ chối do gửi cả metadata settings; đã sửa payload kiểm thử và dọn dữ liệu của lượt lỗi.
- Migration đã backup/apply. Build riêng xác minh `dist` và deployment pointer không đổi;
  scan **25 client artifacts PASS**, candidate source scan không có cấu hình runtime/secret.
  Bản thử tại `127.0.0.1:5180`, public chưa phát hành bộ tính năng này.

Giới hạn: voice dùng nhận dạng giả trong browser tests, chưa kiểm tra micro vật lý; hosted wheel
kiểm tra playback state/Next, không xác nhận âm thanh nghe được. Test không chứng minh đã sửa
báo cáo kéo bài làm mất các bài trước. Xem [ACTIVITIES.md](ACTIVITIES.md).

## Phát hành gợi ý, thành viên và tìm kiếm — 16/11/2026, 19:19

- **286 unit/API/React PASS / 30 files**; TypeScript, ESLint và Prettier đạt.
- Room/session: **94 PASS, 2 SKIP** qua lượt đầy đủ và chạy lại hai ca tìm nhanh.
  Hai ca ban đầu còn kỳ vọng `nhạc chill Việt`; đã sửa kỳ vọng thành từ khóa chuẩn hóa
  `nhạc chill việt` rồi chạy lại đạt trên desktop/mobile. Hai layout skip ở mobile vì
  project desktop đã chủ động quét các viewport tương ứng.
- Game: **18 PASS, 2 SKIP**; gồm ván bốn người hoàn chỉnh, chơi lại, khôi phục kết nối,
  layout và giữ iframe nhạc qua điều hướng. Hai ca skip có kiểm tra tương ứng ở desktop.
- Build cô lập không đổi bản đang chạy. Sau đó chuyển đúng bundle `index-DoRsBGDO.js`
  sang public, giữ các chunk cũ; scan **66 client artifacts PASS**. Preview PID 45396,
  tunnel PID 23028 giữ nguyên. Bản khôi phục tại
  `.roomtune/releases/search-members-20261116-191901/previous` (có secrets, ngoài Git/static).
- HTTPS thật: trang nhạc/game, health và hash toàn bộ assets đúng; API bảo vệ trả 401,
  origin lạ trả 403, đường dẫn cấu hình/server/debug trả 404.
- [Tìm kiếm/link public](SEARCH_LINK_PUBLIC_CHECK.md) PASS: `bad` trả 12 bài;
  video `-q_S27LbNKU` được enqueue thật. [Thành viên public](MEMBERS_PUBLIC_CHECK.md)
  PASS: private Realtime, nhiều tab tính một người, offline/reconnect và mất membership.
  Chỉ tạo/dọn phòng, tài khoản của lượt kiểm thử; không migrate DB hay sửa phòng người dùng.
- Không kiểm chứng âm thanh trong lượt phát hành này. Báo cáo kéo bài lên khiến các bài
  trước biến mất vẫn chưa xác định nguyên nhân; đợt này không sửa hoặc tuyên bố khắc phục lỗi đó.

## Thành viên online/offline — 16/11/2026

- **268 unit/API/React PASS / 28 files** trên mã cuối. Kiểm tra Presence theo từng ID,
  nhiều tab tính một người, replay sau subscribe, trạng thái chưa xác định khi mất kết nối,
  lọc theo membership, cách ly phòng/tài khoản và bỏ callback sau unmount/mất quyền.
  Kiểm tra tìm tên không dấu, lọc đang mở và cập nhật danh sách; refresh không tạo thêm
  channel hay phát Presence khi chỉ còn chat.
- **4 browser PASS** desktop/mobile: cập nhật realtime qua Phoenix fixture và SDK thật,
  nhiều thiết bị, online/offline/tìm tên, thành viên bị loại, iframe và trạng thái phát giữ
  nguyên, không phát lệnh điều khiển nhạc khi mở/đóng danh sách. Màn hình 320px, tên dài,
  danh sách dài cuộn bằng bàn phím, focus trở về nút mở, Axe sáng/tối đều đạt.
- Lượt browser đầu phát hiện vùng cuộn thiếu keyboard focus; đã sửa `tabIndex` và xác minh
  cuộn bằng End/Home. Xem ảnh phát hiện ô tìm tên bị CSS label toàn cục xếp dọc; đã đặt row
  rõ ràng, thêm kiểm tra chiều cao và chạy lại bốn ca đạt.
- [Hosted thật](MEMBERS_HOSTED_CHECK.md) **PASS** trên runtime thử 5180: Auth/membership,
  private Realtime, danh sách desktop/mobile, mở hai tab cùng tài khoản vẫn tính một người,
  rời tab cuối chuyển offline, quay lại chuyển online, chặn người bị thu hồi membership.
  Lượt đầu phát hiện mất mạng ngắn không đóng socket nên không có sync mới; đã thêm retrack
  qua transport dùng chung khi mạng trở lại và kiểm tra lại với browser offline thật đạt.
  Tài khoản/phòng thử đã dọn theo ID. Không kiểm chứng âm thanh trong lượt hosted này.
- Typecheck, lint, format và build cô lập đạt; scan **21 client artifacts PASS**. Public
  `dist` và deployment pointer giữ nguyên. Không migration, không restart public/tunnel.
  Đây là kết quả bản thử trước phát hành. Sau đó đã public lúc 19:19 giờ Việt Nam;
  xem [kiểm tra public](MEMBERS_PUBLIC_CHECK.md) và [hướng dẫn](MEMBERS.md).

## Mở rộng gợi ý nhạc — 16/11/2026

- **263 unit/API/React PASS**: thêm nguồn VN/US/KR/JP, cache riêng 30 phút, đan xen trước
  affinity ranking, gộp bài trùng nhưng giữ các nguồn, tăng giới hạn 24 bài quen/120 khám phá,
  không hạ tiêu chí loại bài lỗi/đang chờ/quá dài; một nguồn lỗi không làm mất nguồn khác.
- **12 browser PASS, 2 layout SKIP**: desktop/mobile xem 12 bài, mở thêm giữ bài cũ, đổi nguồn
  và đổi nhóm không gọi feed lại, thêm một lần/toast, tìm nhanh, Axe/320px, lỗi toàn bộ/một
  nguồn và hồi quy player/biểu quyết. Sau sửa thông báo nguồn lành nhưng hết bài phù hợp,
  riêng hai ca partial failure chạy lại **2 PASS**.
- Typecheck, ESLint, build cô lập và scan **21 client artifacts PASS**. Không thay migration.
  Đã xem giao diện bằng dữ liệu thật; thử hosted nhận **61 bài khám phá** trong phòng mới,
  so với giới hạn 24 trước đây. VN 24 / US 11 / KR 4 / JP 25, có bài thuộc nhiều nguồn nên
  tổng các bộ lọc lớn hơn tổng bài duy nhất. Số bài thay đổi theo dữ liệu YouTube.
- Hosted xác minh bộ lọc/Xem thêm trên desktop/mobile không phát sinh yêu cầu feed mới,
  thêm bài đồng bộ và chặn truy cập sai quyền; dữ liệu phòng/tài khoản thử được dọn.
  Xem [báo cáo local](RECOMMENDATIONS_HOSTED_CHECK.md) và [báo cáo public](RECOMMENDATIONS_PUBLIC_CHECK.md).
- Bản mở rộng đã phát hành lúc **03:36 UTC / 10:36 giờ Việt Nam ngày 16/11/2026**,
  main bundle `index-CeutjgZi.js`. Scan **50 client artifacts PASS**, gồm các chunk cũ giữ lại.
  Chỉ restart preview (PID 9904); tunnel PID 23028 giữ nguyên. Bản khôi phục:
  `.roomtune/releases/recommendations-20261116-103606/previous` (có secrets, ngoài Git/static).
- Kiểm thử public HTTPS **PASS** lúc 03:37 UTC: 61 bài khám phá, đủ bốn nguồn, Xem thêm và
  bộ lọc không gọi feed lại, thêm bài đồng bộ desktop/mobile, chặn outsider/thu hồi membership,
  dọn đúng tài khoản/phòng thử. Đã xem ảnh giao diện dữ liệu thật. Kiểm tra độc lập xác nhận
  bảy tài nguyên mới/cũ khớp hash bản local, API chưa đăng nhập trả 401 và tám đường dẫn
  cấu hình/mã server trả 404. Không kiểm chứng âm thanh trong lượt gợi ý; không migrate DB.

## Gợi ý gu phòng và khám phá — 16/11/2026

- **257 unit/API/React PASS / 26 files** trên mã cuối: xếp hạng theo lịch sử, loại bài lỗi/
  đang chờ/quá dài, đa dạng kênh, permission, cache dùng chung không lộ lịch sử, phản hồi YouTube
  JSON/schema lỗi và cache lỗi vẫn giữ bài quen. Query tách theo phòng và danh tính.
- Room/session suite **86 PASS, 2 SKIP** trên desktop/mobile. Hai ca layout skip trên project
  mobile vì ca desktop đã chủ động quét cả viewport mobile. Bao gồm gợi ý, đổi nhóm không gọi
  API, loading/chống bấm trùng/toast, lỗi discovery, tìm nhanh, 320px và Axe; hồi quy chat,
  biểu quyết, hàng chờ, thiếu host và giữ iframe qua token expiry.
- TypeScript strict, ESLint, Prettier và whitespace checks đạt. Build cô lập giữ nguyên public
  `dist` và deployment pointer; scan 21 client artifacts đạt. Đường dẫn file server trên runtime
  thử không trả khóa bí mật. Không sửa migration; không chạy lại database/backup suite.
- Hosted: [báo cáo](RECOMMENDATIONS_HOSTED_CHECK.md) xác minh Auth/Supabase/YouTube thật, room
  mới có discovery, history join, chặn outsider/revoked member, thêm bài từ mobile cập nhật
  desktop và loại khỏi feed tiếp theo. Lịch sử được gieo trong phòng tạm; không kiểm chứng âm
  thanh hoặc public HTTPS. Chỉ tạo/dọn các phòng/tài khoản của lượt chạy.
- Trước phát hành, tính năng được kiểm tra riêng ở `http://127.0.0.1:5180`.
  Hướng dẫn và giới hạn: [RECOMMENDATIONS.md](RECOMMENDATIONS.md).
- Kiểm tra chỉ đọc trước phát hành: health của preview 4173 và HTTPS public đều 200/configured,
  vẫn phục vụ bundle `index-CrR2RFDU.js`. Preview PID 32996 và tunnel PID 23028 giữ nguyên;
  không restart public. Trạng thái process phải kiểm tra ngoài sandbox vì sandbox có thể
  không đọc được thông tin tiến trình và báo nhầm là stopped.
- Sau yêu cầu public: chuyển đúng build đã kiểm thử sang `dist`, giữ chunk cũ; scan **35 client
  artifacts PASS** (gồm tài nguyên của bản trước). Preview PID 35884; tunnel PID 23028 giữ nguyên.
  HTTPS phục vụ bundle `index-Bp2kNQ1V.js`, chunk gợi ý và game; API chưa xác thực trả 401,
  đường dẫn nội bộ/secrets trả 404. [Kiểm thử public](RECOMMENDATIONS_PUBLIC_CHECK.md) **PASS**:
  discovery, history join, thêm bài desktop/mobile và quyền membership dùng dịch vụ thật,
  tài khoản/phòng thử đã dọn. Không commit/push hoặc migrate database trong lượt phát hành.

## Nhận lại host sau khi máy cũ tắt — 14/11/2026

- **185 unit/API/React PASS / 19 files**; sau sửa kiểu tham số AppError trong test, riêng file
  host recovery **32 PASS**. Bao phủ claim chủ động một lần/StrictMode, không claim khi mount
  thường, không claim chồng, HOST_BUSY cho phép thử lại, ACK sai controller/quá deadline/sau
  unmount không tạo player, listener hết lease dừng và theo host thay thế bằng cùng IFrame.
- **14 browser cases PASS** desktop/mobile: thiếu host owner/member, recovery video listener,
  settings/host reconciliation, bật nghe và token expiry owner/member. Sau gắn key room/actor,
  bốn ca thiếu host chạy lại PASS. Lượt đầu chạy lại bị lỗi fetch khởi động Vite trong sandbox;
  chạy phạm vi browser ngoài sandbox đã đạt. Đã xem ảnh missing-host desktop/mobile.
- Typecheck/lint/format/build và scan **15 client artifacts PASS**. Cảnh báo annotation Zod và
  main bundle >500kB có từ trước. Không thay SQL nên không chạy lại integration PostgreSQL.
- Hosted: `node scripts/test-hosted.mjs --project-ref <ref> --base-url <domain> --browser --host-recovery`.
  Lựa chọn mới đóng toàn bộ context host mà không release, chờ lease hết tự nhiên, xác minh member
  bị từ chối claim, dùng session owner của lượt thử ở context mới và bấm đường nhận lại host.
  Kiểm tra cùng run/entry/checkpoint, fence/controller mới và listener giữ IFrame rồi phát tiếp.
  **13 bước hosted PASS**, gồm ca khôi phục mới và cleanup; PUBLIC_CHECK.md ghi timestamp và
  phạm vi. Đã xem ảnh host-takeover-live.png. Headless mute, không dùng phòng thật của người dùng.

## Chat gọn, giảm round trip API và tay nắm kéo playlist — 14/11/2026

- **176 unit/API/React PASS / 19 files**. Các ca mới xác minh hai rate limit chạy đồng thời,
  chờ cả hai dù một bucket từ chối, không gọi mutation khi bị chặn, Auth vẫn xác minh mỗi
  request, RPC permission denial và Server-Timing chỉ chứa thời lượng. Chat chỉ hiện tin sau ACK,
  mở composer trước refetch chậm, không trùng khi reconcile, xóa được tin vừa ACK và ẩn khi mất quyền.
- **43 PostgreSQL PASS**, cluster cô lập đã dừng: membership/ban/receipt replay trong transaction,
  role/RPC protection, concurrent sends, queue versions, host fencing và backup/restore. Không sửa
  migration hoặc reset database hosted.
- Room/session đầy đủ **74 PASS, 2 lỗi selector mới, 2 SKIP**. Hai lỗi do selector ô nhập bắt cả
  nút “Xóa tin nhắn của bạn”; sửa selector theo textbox chính xác và chờ room load. Chạy lại
  **6 ca chat-layout/drag PASS** trên desktop/mobile. Tổng **76 ca khác nhau đã xác minh**, hai
  skip có chủ đích vì ca desktop đã quét các độ rộng cho cả host/listener.
- Kéo bằng chuột và touch event Chromium thật; bàn phím chọn/di chuyển/hủy, lỗi server giữ thứ tự,
  bật biểu quyết không có tay nắm để bypass. Nút ≥44px, chỉ handle có touch-action none, toàn
  hàng không draggable. Chat sáng/tối, bubble dài, textarea 44–96px, composer gọn, 320px không tràn;
  axe A/AA chat đạt. Đã xem ảnh chat và tay nắm desktop/mobile trong docs.
- Build/typecheck/lint/format và quét **15 client artifacts PASS**. Cảnh báo annotation dependency
  và main chunk >500kB vẫn còn (~676kB minified / 203kB gzip); không đo Lighthouse mới.
- Đo API trước/sau và kiểm tra dịch vụ thật ghi riêng ở LATENCY_CHECK.md / PUBLIC_CHECK.md.
- Hosted public **14 bước PASS**, gồm gửi/nhận/xóa chat đa phòng khi host/listener vẫn giữ
  IFrame YouTube thật đang tăng thời gian; Auth renewal không pause. Thu hồi membership chặn
  API và reconnect private channel. Tài khoản/phòng thuộc lượt thử đã dọn. Headless mute.

## Chat nổi và biểu quyết nổi — 14/11/2026

- **170 unit/API/React PASS / 19 files**. Thêm kiểm tra portal không lấy focus, thu nhỏ giữ qua
  cập nhật, đề xuất mới mở lại, đóng kết quả, slot tránh video/chat trên nhiều viewport.
  Transport: một topic dùng chung, chat-only không track Presence, rời trang vẫn giữ chat,
  reconnect/ACK cũ, handoff nhanh, chờ teardown identity cũ và bỏ callback đến muộn.
- Bộ room/session 72 ca: **69 PASS, 1 lỗi assertion đo trước RAF resize, 2 SKIP** ở lượt đầy đủ.
  Sửa assertion chờ bounds thực ổn định; chạy lại **16 ca chat/biểu quyết/nổi PASS** trên cả
  desktop/mobile. Tổng **70 ca khác nhau đã xác minh**, hai skip là layout mobile đã được
  ca desktop quét đủ độ rộng. Các ca gia hạn phiên, host/listener, rời/vào lại và quyền truy cập đạt.
- Biểu quyết xuất hiện khi đang gõ tìm bài, không đổi focus/geometry, thu nhỏ/mở lại/kết quả/đề xuất mới;
  vẫn cùng IFrame và playback. Chat chọn phòng B trong khi nghe A: chỉ gọi API chat của B,
  không snapshot/presence/commands, không điều hướng, không dịch queue; giữ nháp từng phòng,
  xóa UI khi membership bị thu hồi. Axe A/AA chat/biểu quyết đạt; quét 320/390/1440px, không
  chồng video/chat/vote. Viewport 320×480 mô phỏng thiếu chỗ, chưa thử bàn phím điện thoại vật lý.
- Đã xem ảnh fixture mới desktop/mobile. Sửa search label bị ảnh hưởng `flex-direction: column`
  toàn cục. Chat là lớp nổi, khôi phục assertion queue ngang đỉnh player thay thanh chat trong luồng.
- Typecheck/lint/format/build và scan **15 client artifacts PASS**. Build có warning dependency
  annotation và chunk chính >500kB (khoảng 675kB minified, 202kB gzip); chưa đo lại Lighthouse.
  Không thay SQL hoặc chạy lại DB suite vì thay đổi client/transport.
- Hosted qua domain **14 bước PASS**, dùng hai phòng và tài khoản riêng rồi dọn trong finally:
  chat đa phòng/private Realtime thật, gửi/nhận/xóa, cùng IFrame YouTube tiếp tục phát, không
  snapshot/presence/command ở phòng chỉ chat. Auth renewal giữ cùng player và không pause.
  Xem PUBLIC_CHECK.md; headless mute, không suy ra âm thanh hai thiết bị vật lý.

## Chat trong phòng — 14/11/2026

- **158 unit/API/React PASS / 17 files**: strict HTTP payload, sender forgery, cursor bounds,
  Auth/receipt requirement, identity switch before send, automatic/manual same-key retry,
  double-submit prevention, escaped HTML, draft retention, unread baseline, hidden tab/scrolled-up,
  permission loss hiding cached messages, actor-scoped drafts. Typecheck/lint/format toàn repo đạt.
- **43 PostgreSQL PASS**, tám nhóm chat mới: cross-room/ban/direct RPC grants, concurrent receipt
  retry, message size/unread, author/owner/moderator delete, revoked membership on replay,
  20/min + replay at quota, last 100/30-day retention/export, account/room cascade. Queue/playback
  và version bất biến khi chat; toàn bộ migrations apply trong PostgreSQL cô lập, backup/restore đạt.
- Bộ room/session 68 ca: lượt đầy đủ đạt 63, lỗi hai assertion layout cũ yêu cầu queue ngang đúng
  đỉnh player (nay có thanh chat thu gọn); một ca lỗi khi đóng browser vì trace artifact bị dọn do
  thử mở suite thứ hai khi suite đầu chưa kết thúc. Đã chờ suite đầu hoàn tất, thu gọn chat và cập nhật
  assertion có kiểm tra độ cao ≤60px + ba bài đầu vẫn trong viewport. Chạy riêng 6 ca chat/layout
  PASS + 2 SKIP, sau đó 4 ca revoked membership PASS. Tổng 66 ca đã xác minh, hai skip mobile
  có chủ đích vì ca desktop đã quét toàn bộ độ rộng. Không che giấu lỗi cũ bằng retry config.
- Chat E2E desktop/mobile: gửi/xóa, server đã nhận nhưng mất phản hồi, cùng receipt khi gửi lại,
  không nhân đôi; draft khi đóng/mở, focus khi đóng, đọc lịch sử 100 tin với anchor không nhảy khi
  bị thay tin cũ nhất, badge/jump/unread, thu hồi quyền, viewport 320×480 mô phỏng không gian bàn phím.
  Không xác minh bàn phím hệ điều hành trên điện thoại vật lý. Axe A/AA vùng chat đạt; IFrame ≥200×200,
  không chồng lấp chat, không tạo lại khi chat và không phát command playback. Đã xem ảnh desktop/mobile.
- Build/secret scan **15 client artifacts PASS**. Vẫn có cảnh báo annotation của dependency Zod,
  không ảnh hưởng kết quả build. Không đưa `dist/roomtune/.dev.vars` vào client hoặc phân phối.
- Hosted command: `node.exe scripts/test-hosted.mjs --project-ref zhcnyadfkpszgdmesxvi --base-url https://roomtune.dzoanh.me --browser --chat`.
  **14 bước PASS**, dùng phòng/tài khoản riêng và dọn trong finally. Lượt đầu assertion payload `{}`
  phát hiện Realtime hosted thêm `id`; sửa assertion chỉ cho phép transport ID, vẫn cấm nội dung/tác giả.
  Lượt cuối gửi nhận/xóa bằng hai browser contexts và private Realtime thật trong khi hai IFrame
  YouTube thật tiến triển, cùng iframe qua Auth renewal. Headless mute, không suy ra âm thanh vật lý.
  Migration list bảy phiên bản khớp, public assets/health đạt. Chi tiết `PUBLIC_CHECK.md`.

## Biểu quyết đổi vị trí — 14/11/2026

- **135 PASS / 15 files** unit/API/React: thêm validation payload strict, actor lấy từ Auth, không cho client tự khai electorate/quorum, lifecycle presence, bfcache, heartbeat trễ, đúp submit, chọn đúng vị trí, chặn form cũ, phiếu lỗi cho thử lại, offset đồng hồ/hết hạn. Sau sửa trả focus, 13 ca liên quan chạy lại PASS.
- **35 kiểm tra PostgreSQL 17 PASS**, chạy toàn bộ sáu migration trên cluster tạm. Kiểm tra quorum 2/3/4 người, một người/nhiều tab, thiếu online, phiếu trùng/idempotency conflict, hai phiếu cuối đồng thời, snapshot/order cũ, mất kết nối, người vào sau, đổi ý/không đồng ý/hủy, hết hạn, đổi hàng chờ, tắt cài đặt, kick, quyền cross-room/private RPC, retention và backup/restore. Bài đang phát và playback giữ nguyên sau đổi thứ tự. Cluster đã dừng, dữ liệu hosted thật không dùng cho suite này.
- **62 PASS / 2 SKIP** room/session trên Chromium desktop/mobile. Hai skip là ca layout mobile đã được project desktop quét đủ độ rộng. 8 ca mới kiểm tra bật/tắt, không có kéo-thả/mũi tên bypass, thành viên chọn vị trí cụ thể, loading/toast, đồng ý/không đồng ý, hết hạn, đến muộn, thiếu người và IFrame hiện tại không đổi. Quét 320/390/1440px, bounds nút ≥44px, axe A/AA cho panel và dialog. Đã xem `reorder-desktop-fixture.png` và `reorder-mobile-fixture.png`; sau sửa focus chạy lại 6 ca hộp đề xuất/cài đặt/xác nhận đạt.
- Typecheck/lint/format toàn repo, build và scan 15 client artifacts PASS. Lỗi môi trường đầu: PostgreSQL trong sandbox mở process nhưng client không kết nối được; đã xác minh/dừng đúng cây test rồi chạy ngoài sandbox. Không dừng tunnel hoặc ứng dụng khi xử lý lỗi này. Cảnh báo annotation Zod từ dependency không làm build thất bại.
- Chỉ migration `202611140002` được push sau dry-run, migration list local/remote khớp. Kết quả hosted thật và giới hạn nghe nhạc tiếp tục ghi ở `PUBLIC_CHECK.md`.
- Sửa focus khi panel remount sau snapshot: giữ panel ổn định, chuyển focus trực tiếp đến panel sau gửi, kiểm tra focus thật khi đóng dialog và sau resize. Đối chiếu DOM xác nhận skip-link ở ngoài viewport (top -100px); ảnh full-page mobile lúc trang đã cuộn có thể vẽ sai phần tử fixed này nên chụp lại từ đầu trang. Đã xem ảnh cuối. Đồng hồ dùng mốc mới ngay khi có đề xuất sau thời gian chờ dài. Chạy lại 8 ca biểu quyết và toàn bộ **135 unit/API/React** sau chỉnh cuối đều đạt; build/secret scan và bundle public đã được cập nhật lại.

## Bỏ qua video lỗi — 14/11/2026

- Full unit/API/React: **113 PASS / 12 files**. 36 ca player/loader liên quan đã chạy riêng trước lượt đầy đủ. Phân loại mã lỗi, auto-skip đúng một lần/ACK, hàng chờ hết, thất bại khi chuyển, ba lỗi liên tiếp và reset sau phát có tiến triển, lỗi xác minh trang không chuyển bài, giữ autoplay, lease/session và callback cũ; retry chờ report được hủy khi rời phòng.
- Room/session E2E đầy đủ: **54 PASS / 2 SKIP**. Hai skip là ca layout mobile đã được ca desktop quét mọi độ rộng. Các ca mới chạy trên desktop/mobile với YouTube callback fixtures: host tự chuyển hai bài hỏng rồi dừng ở bài thứ ba; giữ ba bài còn lại; tiếp tục thủ công; listener không gửi command và link mở đúng video ở tab mới. Có kiểm tra feedback/toast, nút ít nhất 44px, IFrame tối thiểu 200×200, không tràn ngang tại 320/390/768/1440px và axe A/AA vùng recovery. Đã xem `playback-error-desktop.png` và `playback-error-mobile.png`.
- Typecheck, lint và format các tệp thay đổi PASS; Worker/client build và scan 15 client artifacts PASS. Lượt browser đầu trong sandbox không mở được server do mạng/quyền log; chạy lại với log trong workspace và quyền scoped đạt. Cảnh báo annotation Zod là cảnh báo dependency có từ trước.
- Không sửa SQL nên không chạy lại DB migration suite. Lỗi YouTube được tiêm qua fixture để tái lập ổn định, không phải chứng minh các video thật luôn trả cùng mã. Kiểm tra phát thật/hosted và dữ liệu dọn dẹp ghi trong `PUBLIC_CHECK.md`.
- Hosted bản mới qua domain: **12 bước PASS**, gồm hai IFrame YouTube thật tiếp tục tiến triển, qua gia hạn Supabase Auth không pause, theo pause/resume và dọn phiên nghe/rời phòng. Mẫu quan sát 14.1s host/11.8s listener không phải cam kết đồng bộ; headless mute. Phòng/tài khoản riêng đã dọn, không sửa phòng của người dùng.

## Bố cục thành viên/host — 14/11/2026

- Room E2E: 34 PASS, 2 ca mobile layout SKIP có chủ đích vì ca desktop đã chạy mọi độ rộng. Ca thành viên không có player local đã mở rộng qua 320/390/1024/1100/1366/1920/2560px và hàng chờ/tìm kiếm/thư viện/lịch sử: luôn thấy bài đang phát, nội dung dùng hết cột, không tràn ngang, không tạo IFrame hoặc cấp điều khiển host. Ca host/listener đang phát xác minh tìm kiếm dùng hết cột, summary vẫn hiện và IFrame không đổi.
- Đã xem ảnh desktop/mobile ở `member-search-1920-fixture.png`, `member-search-390-fixture.png`; axe, pending/toast, settings và rời/vào lại tiếp tục đạt. Typecheck/lint/format/build và 15-artifact secret scan PASS. Không đổi API/Auth/SQL nên không chạy lại unit/DB/hosted mutation suites; kiểm tra public HTML/JS/CSS HTTP 200 sau refresh preview.

## Gia hạn phiên — 14/11/2026

- `npm test`: 91 PASS/11 files; sau thêm regression lỗi gia hạn tạm thời, file API chạy lại 16 PASS (92 ca khác nhau đã đạt). Bao gồm concurrent refresh, token đã được SDK thay, tối đa một refresh, giữ payload/receipt, mất refresh token, đổi identity/đăng xuất giữa request, Auth upstream 401/403 so với 429/500/503.
- Host: lỗi heartbeat tạm thời giữ nguyên IFrame; phục hồi trước deadline; mất mạng kéo dài dừng đúng watchdog 25s; mất quyền dừng ngay; không chồng request, ACK đến muộn không hồi sinh lease.
- Đọc ảnh màn hình khôi phục phát hiện nút mobile bị cắt về bên trái dù scrollWidth không tăng. Đã đổi sang nút xếp dọc trên mobile, bổ sung assertion toàn bộ bounds của từng nút trong viewport và dọn toast thành công cũ khi mất phiên thật.
- `session.spec.ts`: 16 PASS trên Chromium desktop/mobile, cả owner/member. SDK thật với Auth/API/player fixtures: metadata access token hết hạn, HTTP 401 rồi refresh, snapshot 503 rồi phục hồi giữ cùng IFrame và không pause; refresh bị thu hồi, membership 403 và explicit logout đều tháo player, không signup khách mới. 4 ca khôi phục chạy lại với kiểm tra tràn ngang và ảnh `session-recovery-{desktop,mobile}.png` đạt.
- `room.spec.ts`: 34 PASS/2 SKIP có chủ đích, bao gồm layout 320–2560px trong project desktop, accessibility, hàng chờ, pending/toast, settings, vào lại/rời phòng và listener opt-in. Không sửa DB/migration, không chạy lại DB suite vì không đổi SQL.
- Strict typecheck, lint, format và Worker/client build đạt; 15 client artifacts qua secret scan. Build đầu có cảnh báo annotation Zod và không ghi được log Wrangler ngoài sandbox; output Worker/client vẫn tạo xong, exit 0. Lượt build UI cuối chuyển đường log về `.roomtune`, không còn lỗi quyền ghi log, chỉ còn cảnh báo dependency annotation.
- Hosted qua HTTPS: 12 bước PASS, phòng/tài khoản thử được dọn. Ép mốc expires_at local của hai phiên riêng để SDK gọi Supabase Auth thật, không thay chính sách hosted; cả host/listener giữ cùng IFrame/identity, thời gian tăng và không có pause event trong cửa sổ gia hạn. Pause/resume/leave và private Realtime/revocation tiếp tục đạt. Không chờ JWT hết hạn tự nhiên một giờ và không kiểm chứng âm thanh vật lý (headless mute).

## Bổ sung layout/loading/toast — 14/11/2026

- Unit/React liên quan: **18 PASS**; sau chỉnh cuối listener/feedback, **13 PASS** trong hai file. Bao gồm chống bấm trùng, nhả pending khi lỗi, giữ hộp xác nhận để retry, hủy timer loading và định vị toast tránh player.
- Room E2E: **34 ca đạt qua các lượt**, hai bản mobile của ca layout được skip vì ca desktop tự kiểm tra 11 độ rộng 320–2560px. Lượt đầy đủ đầu có hai assertion cũ kiểm tra bounding box của `ol` Sonner (không có chiều cao riêng); thay bằng kiểm tra card thực sự nằm trong viewport. Lượt kiểm tra lại liên quan **12 PASS / 2 SKIP**, gồm playlist lỗi một phần mới thêm.
- Kiểm tra mạng chậm chủ động giữ request: spinner/disabled hiện ngay, toast pending rồi lỗi/thành công, không gửi trùng. Chuyển tab trong lúc thêm từ thư viện vẫn nhận kết quả. Playlist lỗi ở bài thứ hai báo đúng 1/3, không báo thành công toàn bộ. Lưu cài đặt khi player ở ngoài màn hình vẫn thấy thông báo.
- Layout kiểm tra player/queue ngang hàng, ba bài đầu trong viewport desktop, không cuộn ngang, IFrame tối thiểu 200×200 và chỉ tạo một lần khi đổi tab/resize; toast không giao video cả trước/sau cuộn. Axe quét room và hai ca public sáng/tối/form đều đạt.
- Typecheck, lint các file thay đổi, Prettier và build đạt. Secret scan **15 client artifacts PASS**. Xem ảnh `layout-owner-*-fixture.png`, `layout-member-*-fixture.png` cho giao diện với dữ liệu giả được ghi nhãn. Bằng chứng dùng dịch vụ/IFrame thật ở `PUBLIC_CHECK.md` và ảnh `listening-*-live.png`.

## Kết quả nền trước thay đổi

Đây là kết quả trên máy phát triển. Fixtures chỉ nằm trong tests, không có fake backend trong production.

| Lệnh               | Kết quả                                                          |
| ------------------ | ---------------------------------------------------------------- |
| pnpm typecheck     | PASS, TypeScript strict                                          |
| pnpm lint          | PASS với ESLint 10, không warning                                |
| pnpm format:check  | PASS, Prettier source/config/docs; loại trừ reports sinh tự động |
| pnpm test          | **58 PASS**, 10 files                                            |
| pnpm test:db       | **23 PASS**, PostgreSQL 17 thật                                  |
| pnpm test:e2e      | **12 PASS**, Chromium desktop/mobile                             |
| pnpm test:e2e:room | **12 PASS**, API/Auth/player fixtures                            |
| pnpm build         | PASS, Worker + Static Assets                                     |
| pnpm check:secrets | PASS, 12 client artifacts; kiểm tra heuristic                    |
| pnpm audit --prod  | Không có advisory đã biết tại thời điểm chạy                     |
| pnpm peers check   | PASS                                                             |

## Unit/API/React

Domain ordering/URLs/contracts; API origin/auth/body validation; YouTube HTTP fixtures; authenticated HTTP fixtures xác minh actor lấy từ getUser, không từ body; failed PIN counter commit riêng. Retry exponential giới hạn 2 lần, giữ nguyên payload/request key, không retry permission/quota/delete/join. React tests kiểm tra callback từ iframe cũ bị bỏ qua, CAPTCHA reset bỏ token đã dùng và thông báo host dùng Sonner thật (thứ tự, dismiss, hết hạn). Adapter YouTube giữ đúng receiver của native fetch trong Cloudflare Worker; phân biệt key bị từ chối với hết quota.

## Database và backup thật

Áp dụng cả 4 migration nguyên bản lên cluster cô lập. Kiểm tra capacity/PIN, 30 concurrent enqueue và 30 vote, idempotency, cross-room, member playback denial, single host lease, Next/ENDED race, stale fencing, heartbeat resume position, moderation, RLS/RPC grants, SQL policies private realtime, playlist ownership, PIN receipt không plaintext, reorder/version, retention, room-code rotation và account anonymization.

pg_dump/pg_restore thật sang database roomtune_restore_check, so sánh row counts, function room_snapshot và RLS. Cluster được dừng sau mỗi lượt; dữ liệu tạm giữ để chẩn đoán. Windows cần PostgreSQL clients ở PG_BIN hoặc mặc định PostgreSQL 18/bin; Linux cần pg_dump/pg_restore >=17 trong PATH.

auth.users/auth.uid/realtime.messages/topic/send là fixtures mô phỏng managed schemas. SQL/transactions/RLS thật sự chạy; GoTrue/JWT ký thật/WebSocket/policy cache của Supabase chưa được kiểm tra.

## Browser và accessibility

Public: landing/theme persistence/navigation/validation/missing config/404/privacy/320px. Room fixture: vote/remove/QR, search/link, library/history, settings, host claim/release/giữ player khi đổi tab, rollback optimistic, 320px. Không có âm thanh hoặc video thật trong các fixture này.

Axe quét WCAG 2 A/AA và 2.1 A/AA: landing tối/sáng, join/login/privacy, room queue/settings trên desktop/mobile. Không còn violation trong phạm vi này; đã sửa QR thiếu tên và màu nút chuyển theme. Không thay thế kiểm tra screen reader/manual accessibility toàn ứng dụng.

E2E dùng server riêng: public 5175 và room 5174; cache Vite theo mode và output test tách riêng để tránh dùng preview cũ hoặc ghi đè traces. Test servers được Playwright dừng. Ảnh docs/landing-\*.png là landing thực; ảnh host/room chứa fixture ghi rõ trong tên và nội dung.

## Lighthouse và build

Lighthouse 13.6.0 mobile, simulated throttling, landing trên built Worker local 127.0.0.1:5173: Performance 100, Accessibility 100, Best Practices 100. Lượt đo đầu FCP/LCP khoảng 1,0 giây, TBT 10ms, CLS 0. Xem lighthouse-local.report.html và .json để lấy cấu hình/số liệu chính xác của lượt gần nhất. Đo không có Supabase/Turnstile keys; không đại diện cho phòng authenticated hoặc hosting thật.

Main client chunk khoảng 410kB trước gzip; Access/Room/components tải lazy. Build còn warning annotation trong Zod upstream, không phải lỗi TypeScript. Script secret scan chỉ tìm marker/key patterns phổ biến, không phải đánh giá độc lập toàn bộ secrets.

## Chưa xác minh trước release

Thu hồi quyền khi channel đang kết nối và vận hành reconnect/missed events dài ngày; 30 clients HTTP/WebSocket thật; YouTube autoplay/ads/seek/handover và các mã lỗi khác; CAPTCHA thật; Cloudflare deploy/cron/CPU/static CSP/queue persistence; restore Supabase hosted. Không suy rộng test PostgreSQL concurrent thành load test full-stack. Hosted Auth/private Realtime và chặn subscribe lại sau kick đã được kiểm tra riêng bên dưới.

## Kiểm thử dịch vụ thật sau cấu hình

Xem HOSTED_CHECK.md: đã chạy Auth email/password/anonymous, tạo phòng và PIN join qua Hono local, RLS/service-only RPC, private Realtime/Presence/Broadcast, YouTube metadata/search, enqueue/vote, quyền host và thu hồi membership khi reconnect. Tài khoản/phòng do lượt kiểm thử tạo ra được dọn theo ID. Đây không phải kiểm thử âm thanh/IFrame hoặc deployment Cloudflare.

## Sửa playback và xác minh thủ công

Tái hiện trên phòng người dùng: “Nàng Thơ” (Zzn9-ATB9aU) trả error 150, sau đó iframe rỗng che lỗi bằng error 2. Theo [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference#onError), 101/150 là lỗi không cho phép phát nhúng. Đã hiển thị lý do, giữ lỗi gốc khi hết hàng chờ và không tạo iframe khi chưa chọn video. Player nhận videoId/start lúc khởi tạo, chờ ready, không tự phát khi phục hồi paused hoặc gửi lại play vì cập nhật position. Bốn tests mới kiểm tra idle → play/readiness, paused restore/snapshot, error 150 → idle/stale error, và autoplay blocked → thao tác người dùng; tổng 58 tests PASS.

History đã hết lỗi PGRST201 sau khi chỉ định profiles!queue_entries_requested_by_fkey. Kiểm chứng trực tiếp lịch sử của phòng hiển thị các bài đã phát/lỗi. Thử “Em Về Đi Em” (sIKGC2VX63I): iframe và app cùng PLAYING; thời gian tăng từ 0:17 → 0:26 → 1:51. Người dùng xác nhận nghe được âm thanh. Đây là một video trên trình duyệt hiện tại, không suy rộng cho mọi bài hoặc môi trường. Hai host E2E desktop/mobile chạy lại PASS; typecheck, ESLint và build PASS.

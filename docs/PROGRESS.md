# ROOMTUNE — Tiến độ

## Nhận lại host sau khi máy cũ tắt — 14/11/2026

- Người dùng xác nhận tình huống AE CTV bật ALL_DEVICES và máy host tắt. Listener vẫn cần
  controller hợp lệ; Play local bị dừng khi lease hết hạn. Bản cũ thiếu đường nhận host rõ ràng
  ngay trong thông báo chờ. Chẩn đoán chỉ đọc sau sự cố không chứng minh một lỗi heartbeat riêng.
- Listener hiện hướng dẫn và **Kiểm tra lại host** cả trước khi bật nghe. Owner/moderator có
  **Nhận quyền host trên máy này**, mở máy phát và gửi đúng một claim từ thao tác đó. Thành viên
  thường được hướng dẫn liên hệ người có quyền. Phân biệt host tạm dừng và host chờ bật âm thanh.
- Giữ bài/run/checkpoint, quyền SQL, watchdog/lease và listener isolation. Claim gắn room/actor,
  tiêu thụ một lần, chặn trùng và phản hồi muộn/sai controller; tải lại bình thường không tự claim.
  Không sửa migration hoặc dữ liệu hai phòng thật. Bản chat/API/tay nắm kéo trước đó được giữ.
- 185 unit/API/React đạt; 32 ca host recovery chạy lại sau chỉnh kiểu test đạt. 14 ca browser
  liên quan desktop/mobile đạt; bốn ca thiếu host chạy lại sau khi gắn identity đạt. Đã xem ảnh
  desktop/mobile. Typecheck/lint/format/build và secret scan 15 client artifacts đạt.
- Preview được làm mới, tunnel giữ nguyên. HTML, JS `index-CmyD6DfW.js`, CSS `index-D_Xl_i4L.css`
  qua domain trả 200, health configured. Hosted qua domain **13 bước PASS** lúc
  `2026-11-14T08:24:34.038Z`: đóng context host không release, lease hết tự nhiên, context owner
  khác nhận lại cùng run/entry/checkpoint, fence/controller mới và listener phát tiếp bằng cùng
  IFrame YouTube thật. Claim của member bị từ chối. Đã dọn tài khoản/phòng thử; xem PUBLIC_CHECK.md.
  Kiểm thử headless tắt âm thanh, chưa xác minh âm thanh trên hai máy vật lý. Preview PID 43024,
  tunnel PID 10976 đều đã đối chiếu executable/start time/command line và còn chạy.

## Chat gọn hơn, API nhanh hơn và nút Kéo playlist — 14/11/2026

- Chat có bubble trái/phải rõ ràng, màu sáng/tối đủ tương phản, header/composer gọn, textarea
  tự giãn 44–96px và nút gửi icon. Giữ chat đa phòng nổi độc lập với playlist/player. Tin hiển thị
  sau receipt ACK, composer mở lại ngay rồi refetch nền; thử lại giữ receipt, không nhân đôi tin.
- Nút **Kéo** sáu chấm 44×48px ở đầu từng bài cho chủ phòng/moderator khi MANUAL và tắt biểu quyết.
  Hỗ trợ chuột/cảm ứng/bàn phím, vạch đích trước/sau theo hướng kéo, cuộn khi sát mép viewport,
  hủy/permission gate và giữ nút lên/xuống. Khi bật biểu quyết vẫn dùng Đề xuất vị trí.
- Hai rate limit độc lập chờ song song sau xác minh Auth. Bỏ HTTP membership read lặp cho chat
  và queue không-enqueue; RPC vẫn kiểm tra membership/ban/receipt/role trong transaction.
  Không cache token/quyền, không sửa migration. Server-Timing chỉ có thời lượng.
- Đo public gửi chat từ **746ms xuống 503ms (−32,6%)**; đọc chat/snapshot vẫn khoảng 484–492ms.
  Mỗi tác vụ 5 mẫu sau warmup, cùng máy qua domain; không phải p95 hoặc cam kết mọi mạng.
  Hai lượt đo đã dọn đúng tài khoản/phòng thử. Chi tiết LATENCY_CHECK.md.
- **176 unit/API/React, 43 PostgreSQL, 76 ca browser khác nhau PASS**, hai skip có chủ đích.
  Lượt browser đầy đủ có hai lỗi selector kiểm thử mới, đã sửa và chạy lại sáu ca liên quan đạt;
  xem TESTING.md. Đã xem ảnh chat sáng/tối và tay nắm desktop/mobile. Build/typecheck/lint/format
  và scan 15 artifacts đạt; cảnh báo dependency annotation/chunk lớn còn như trước.
- Đã refresh riêng preview PID **47996**, tunnel PID **10976** giữ nguyên. Public HTML/assets
  HTTP 200, health configured; JS `index-BInI9pvF.js`, CSS `index-CdJAMV9-.css`, Room
  `Room-DTDTOJJk.js` / `Room-BECpWek3.css`. Hosted **14 bước PASS** gồm chat đa phòng, quyền truy cập
  và hai IFrame YouTube thật giữ nguyên qua Auth renewal, không ghi nhận pause trong cửa sổ thử.
  Tài khoản/phòng thử đã dọn. Headless mute; không xác nhận âm thanh trên hai máy vật lý.

## Chat nổi và biểu quyết nổi — 14/11/2026

- Thay thiết kế chat trong luồng bên dưới bằng nút nổi góc dưới bên phải, khung chọn phòng và
  bản nháp riêng từng phòng. Nghe A/chat B không điều hướng, track Presence ở B hoặc đổi nhạc.
  Khung tồn tại qua chuyển trang; đổi tài khoản/mất membership bỏ dữ liệu phiên cũ.
- Biểu quyết mới tự mở thẻ nổi ở góc trên bên phải trên mọi mục trong phòng nghe. Bỏ phiếu ngay,
  thấy số phiếu/thời hạn, có nút thu nhỏ và mở lại. Đề xuất mới tự mở; cùng đề xuất không tự bung
  sau mỗi cập nhật. Giữ kết quả đến khi đóng, không tự chiếm focus hoặc làm dịch playlist.
- Thẻ biểu quyết, chat và toast bố trí ngoài IFrame. Màn hình chật tự thu chat về launcher;
  thu nhỏ biểu quyết hoặc cuộn ra khỏi video để mở. Luật đa số/ít nhất hai phiếu giữ nguyên.
- **170 unit/API/React PASS**, **70 ca browser khác nhau đã xác minh + 2 skip có chủ đích**
  qua lượt đầy đủ và lượt chạy lại 16 ca liên quan. Xem TESTING.md để biết assertion resize đã sửa.
  Typecheck/lint/format/build, scan 15 artifacts đạt; không thêm/sửa migration.
- Đã refresh riêng preview PID 47592, tunnel giữ nguyên. Public health configured; HTML và assets
  `index-D3zthhIL.js`, `index-CBHVYRn6.css` HTTP 200. Hosted **14 bước PASS**, gồm chat desktop/mobile
  trong cùng phòng và chọn phòng B khi vẫn nghe A; không điều hướng/gọi lệnh nghe ở B. Hai IFrame
  YouTube thật tiếp tục tăng thời gian, giữ qua Auth renewal không pause. Đã dọn đúng hai phòng và
  tài khoản của lượt thử; không dùng phòng thật. Headless mute, chưa xác minh âm thanh vật lý.

## Chat giữa thành viên trong phòng — 14/11/2026

- Đã triển khai và đưa lên `https://roomtune.dzoanh.me`. Mở **Trò chuyện** phía trên hàng chờ:
  bên cạnh player trên desktop, dưới khu vực nghe trên mobile. Thanh thu gọn không chiếm chỗ lớn;
  ba bài đầu vẫn ở trong viewport desktop tại các kích thước đã đo. Khung chat không đè IFrame.
- Tin văn bản theo phòng, tên/giờ gửi, unread riêng theo thiết bị/tài khoản/phòng, đồng bộ private Realtime.
  Không tính lịch sử lần đầu thành tin mới; chỉ đánh dấu đọc khi khung ở trong màn hình và đang ở cuối.
  Giữ vị trí khi đọc tin cũ, có nút nhảy tới tin mới. Bản nháp giữ khi đóng chat/đổi mục trong phòng.
- Nút gửi có loading, chặn gửi đôi; gửi lại nguyên nội dung sau lỗi mơ hồ giữ receipt. Member xóa tin
  của mình, owner/moderator xóa tin trong phòng. Nội dung xóa được gỡ khỏi body/receipt/export;
  audit chỉ lưu ID. Plain text, tối đa 1.000 ký tự, 100 tin hiển thị trong 30 ngày, 20 tin mới/phút.
- Sequence/cache/event riêng; không đổi queue, playback/run/fence/lease hay room version khi chat.
  API và SQL kiểm tra membership/ban, expectedActor ngăn gửi bản nháp bằng tài khoản mới.
  Broadcast app rỗng, hosted Realtime thêm transport ID; không phát nội dung/tác giả trên channel.
- Đã áp dụng duy nhất migration `202611140003_room_chat.sql` sau DB checks và dry-run. Bảy migration
  local/remote khớp. Không chỉnh migration cũ, không reset DB và không dùng phòng thật để thử.
- Kết quả: **158 unit/API/React PASS**, **43 PostgreSQL PASS**; **66 ca room/session browser đã đạt
  qua lượt đầy đủ và chạy lại các ca lỗi, 2 layout SKIP có chủ đích**. Typecheck/lint/format/build đạt;
  secret scan 15 client artifacts đạt. Xem `TESTING.md` để biết lỗi kiểm thử ban đầu và phạm vi xác minh.
- Hosted qua domain **14 bước PASS**: chat API/quyền/export, private Realtime, hai browser contexts
  desktop/mobile gửi nhận/xóa đồng bộ trong khi hai IFrame YouTube thật tiếp tục tăng thời gian;
  sau đó gia hạn Auth giữ IFrame và không pause. Headless mute, không xác nhận âm thanh trên hai thiết
  bị vật lý. Phòng/tài khoản thử được dọn; chi tiết `PUBLIC_CHECK.md`.
- Refresh riêng preview (PID 44484), giữ tunnel PID 10976. Trang/JS/CSS HTTP 200 và health configured:
  `/assets/index-cFHPKTz8.js`, `/assets/index-qdpE17z4.css`. Chưa đổi sang Workers production/cron.

Giới hạn v1: chưa upload ảnh/tệp, sửa tin, chat riêng hoặc push khi đóng trang; draft chỉ trong memory.
API ẩn tin quá 30 ngày; dọn vật lý khi có chat mutation hoặc maintenance, chưa có cron trên preview.

## Biểu quyết đổi vị trí bài — 14/11/2026

- Chủ phòng bật/tắt tại **Cài đặt phòng → Hàng chờ & bình chọn → Biểu quyết khi đổi vị trí bài**, rồi lưu. Mặc định tắt để giữ cách vận hành hiện tại. Khi bật, mọi thành viên dùng **Đề xuất vị trí** cạnh bài trong hàng chờ, chọn đầu hàng chờ hoặc vị trí cụ thể. Bài đang phát không nằm trong danh sách cần sắp xếp.
- Thông qua khi đạt **quá nửa số người online lúc mở đề xuất, tối thiểu 2 phiếu đồng ý**. Người đề xuất được tính một phiếu. Một người mở nhiều tab chỉ có một phiếu; không thể tự duyệt lúc ở một mình. Người vào sau không bỏ phiếu cho đề xuất cũ; mất kết nối không hạ mẫu số. Chủ phòng có thể tắt biểu quyết để trở lại sắp xếp trực tiếp của owner/moderator.
- Mỗi phòng có một đề xuất đang mở, hết hạn sau 2 phút. Có Đồng ý/Không đồng ý, số phiếu cần có, đếm ngược, trạng thái cuối, loading/toast và hủy đề xuất. Khi hàng chờ thay đổi, thành viên bị thu hồi quyền hoặc tắt tính năng, đề xuất cũ không được áp dụng. Hộp chọn vị trí chặn gửi nếu thứ tự đã đổi trong lúc mở. Giữ IFrame và trạng thái bài đang phát.
- Online dùng lease được Auth xác minh tại server: 60 giây, heartbeat 20 giây, nhiều tab gộp theo user. Khi đóng/rời tab gửi offline best-effort; số thứ tự chặn heartbeat cũ hồi sinh tab. Quay lại bfcache gửi xác nhận mới. Không dùng số online do client/Realtime tự khai để quyết định quorum.
- Migration mới `202611140002_reorder_approval.sql` đã qua dry-run, áp dụng lên đúng project linked; sáu migration local/remote khớp. Không sửa năm migration cũ, không reset DB. Presence/proposals/votes ở schema private; reorder và phiếu chạy chung transaction/room lock, giữ receipt, membership và host fencing. Dọn presence quá 1 ngày, đề xuất quá 30 ngày qua maintenance hiện có; cron thực tế vẫn là giới hạn hạ tầng cũ.
- Kiểm tra: **135 unit/API/React**, **35 PostgreSQL**, **62 room/session browser PASS + 2 layout SKIP có chủ đích**. Sau sửa focus hộp thoại, 13 unit và 6 browser liên quan chạy lại đạt. Typecheck/lint/format/build và scan 15 client artifacts đạt. Đã xem ảnh desktop/mobile, kiểm tra 320/390/1440px, axe A/AA, giữ IFrame và bài đang phát khi biểu quyết.
- Đã refresh riêng preview, giữ tunnel. Domain/JS/CSS HTTP 200, health configured; JS `index-DOrK8_CD.js`, CSS `index-CddMz6dc.css`. Hosted qua domain **13 bước PASS**, gồm Auth/Realtime thật, presence/quorum/không cho bypass, biểu quyết bằng hai browser desktop/mobile, tắt để sắp xếp trực tiếp và dọn dữ liệu thử. Hai IFrame YouTube thật vẫn tiến triển qua gia hạn Auth (mẫu host 12.6s/listener 12.0s), không có pause event trong cửa sổ kiểm tra; headless mute. Không dùng phòng thật của người dùng. Chi tiết/giới hạn trong `PUBLIC_CHECK.md`.

## Xử lý video lỗi — 14/11/2026

- Theo lựa chọn cuối của người dùng: host tự bỏ qua lỗi video YouTube 2/5/100/101/150, chuyển sang bài kế tiếp và báo tên bài bị bỏ qua sau khi server xác nhận. Hết hàng chờ thì báo hết bài, không báo đang phát bài mới. Có spinner lúc gửi lệnh, chặn callback/phím tắt gây chuyển trùng. Lệnh thất bại giữ màn hình xử lý lỗi để thử lại.
- Dừng ở bài lỗi liên tiếp thứ ba để tránh quét hết hàng chờ khi máy phát/YouTube gặp vấn đề. Bộ đếm chỉ reset sau ít nhất 5 giây phát với vị trí tăng ít nhất 4 giây, hoặc người dùng chủ động thử lại/bỏ qua. Lỗi 153, mã không rõ và không tải được API/IFrame không tự bỏ bài; giữ hướng dẫn phục hồi. Autoplay vẫn yêu cầu cử chỉ, không coi là bài hỏng.
- Dùng lệnh `next` nguyên tử có run/controller/fence/receipt hiện có; lịch sử ghi `SKIPPED`. Bài lỗi bị bỏ qua kể cả khi tắt tự chuyển lúc bài kết thúc bình thường. Không đổi SQL/migration. Listener không có API thay đổi hàng chờ, lỗi local chỉ cho thử lại tại máy đó; không làm cả phòng đổi bài.
- Nút thử lại tạo IFrame mới cho cùng bài, giữ âm lượng và vị trí host (listener theo vị trí phòng), bỏ qua callback cũ và hủy thao tác chờ khi rời phòng/mất quyền. Có timeout 20 giây cho IFrame chưa ready; API loader timeout 15 giây và dọn script hỏng trước khi thử lại. Không dùng thời gian quảng cáo/buffering để kết luận bài hỏng.
- Khi cần xử lý thủ công, có liên kết mở đúng bài trên YouTube/tìm bản khác. Link chỉ mở khi người dùng chọn; nhạc ngoài YouTube không đồng bộ với phòng. Các điều khiển/hướng dẫn nằm ngoài IFrame, tối thiểu 200×200.
- Kiểm thử: **113 unit/API/React PASS**, **54 room/session browser PASS, 2 mobile layout SKIP có chủ đích**; các ca desktop layout đã quét mọi độ rộng. Thêm hồi quy auto-skip, chống trùng, ba lỗi liên tiếp, reset khi phát ổn định, lỗi gửi lệnh, callback cũ, rời phòng khi retry đang chờ, timeout/API loader, listener độc lập và link ngoài. Kiểm tra 320/390/768/1440px, axe và toast ngoài IFrame; đã xem ảnh desktop/mobile.
- Typecheck/lint/format/build và secret scan 15 client artifacts đạt. Đã refresh riêng preview, domain/JS/CSS HTTP 200, health configured; tunnel giữ nguyên. Bundle `index-D-5Td_qn.js`, CSS `index-BUU4SI2i.css`. Lượt phát thật và giới hạn kiểm chứng ghi riêng trong `PUBLIC_CHECK.md`.
- Hosted qua domain đạt **12 bước** và dọn tài khoản/phòng thuộc lượt thử. Hai IFrame YouTube thật tăng thời gian (mẫu quan sát host 14.1s, listener 11.8s), giữ cùng IFrame qua gia hạn Auth thật và không có pause event trong cửa sổ gia hạn; pause/resume/rời phòng đạt. Headless tắt âm thanh hệ thống. Lỗi video vẫn được tái lập bằng fixture, không thay bài trong phòng thật.

## Đồng nhất bố cục thành viên và host — 14/11/2026

- Ảnh người dùng là thành viên ở mục Tìm & thêm bài. Khi không có player local, code cũ ẩn toàn bộ cột thông tin bài hát ở các mục ngoài hàng chờ, đồng thời giới hạn tìm kiếm/thư viện 950px; vì vậy màn hình lớn để trống nhiều bên phải và khác máy host.
- Giữ thông tin bài đang phát ở mọi mục cho mọi vai trò. Desktop dùng chung hai cột, tìm kiếm/thư viện dùng hết chiều rộng cột nội dung; mobile xếp dọc. Ghi rõ âm thanh phát tại host hay từng thiết bị có thể bật nghe. Chủ phòng vẫn có các mục quản trị riêng; chế độ chỉ host không tạo IFrame trên máy thành viên.
- 34 room E2E PASS, 2 SKIP có chủ đích. Mở rộng ca bố cục thành viên HOST_ONLY qua 7 kích thước 320–2560px và bốn mục, xác minh không tràn ngang, không tạo player/hiện điều khiển host. Các ca host/listener ALL_DEVICES giữ nguyên IFrame qua đổi tab/resize đạt; axe và các luồng hàng chờ/settings/rời/vào lại đạt. Đã xem ảnh `member-search-1920-fixture.png`, `member-search-390-fixture.png`. Typecheck/lint/format/build và secret scan 15 artifacts đạt. Không thay API/Auth/SQL, không chạy lại hosted mutation suite cho thay đổi bố cục này.
- Preview public đã refresh, tunnel giữ nguyên. HTML, JS `index-CvmZyq42.js` và CSS `index-C0OcCQCV.css` trả HTTP 200 qua domain. Các tab đang mở cần tải lại một lần để nhận assets mới.

## Gia hạn phiên trong khi nghe — 14/11/2026

- Gia hạn tự động đã có trong Supabase SDK. Đã sửa các đường lỗi khiến một lỗi Auth/kết nối tạm thời bị báo hết phiên, snapshot nền tháo toàn bộ player và host dừng ngay sau một heartbeat lỗi. Không có bằng chứng sự cố cụ thể của người dùng trước thay đổi; kiểm thử chủ động tái tạo các tình huống liên quan.
- API phân biệt lỗi Auth tạm thời và mất phiên thật; HTTP 401 rõ ràng được thử lại một lần sau gia hạn dùng chung, giữ identity/payload/receipt. Không lặp token bị từ chối sau lỗi gia hạn tạm thời. Đăng xuất/đổi tài khoản chặn kết quả cũ; không tự tạo khách.
- Player giữ nguyên khi snapshot nền gặp lỗi tạm thời và tự đồng bộ lại. Cache phòng gắn user ID. Host thử phục hồi trong watchdog hiện có, không gia hạn nếu chưa có ACK đúng controller/fence, không chồng heartbeat và không phục hồi quyền bằng ACK đến muộn. Mất phiên/quyền thật vẫn dừng; màn hình khôi phục giữ đường đăng nhập về phòng và link tham gia có sẵn mã.
- Kiểm tra: toàn bộ 91 unit/API/React đạt trước bổ sung ca lỗi gia hạn tạm thời; file API sau bổ sung đạt 16 ca, tổng 92 ca khác nhau đạt. 16 ca E2E gia hạn desktop/mobile đạt; 34 ca phòng hồi quy đạt, 2 ca layout mobile skip có chủ đích. 4 ca màn hình khôi phục chạy lại đạt và đã chụp ảnh. Typecheck/lint/format/build và secret scan 15 client artifacts đạt (build có cảnh báo dependency annotation và quyền ghi log Wrangler, artifacts vẫn hoàn tất).
- Public trả HTTP 200 cho HTML và bundle cuối `index-RsgD1UC5.js` (CSS `index-BrvOdli0.css`). Chỉ refresh preview; tunnel tiếp tục chạy. Hosted đạt 12 bước và dọn sạch phòng/tài khoản thuộc lượt thử. Hai IFrame YouTube thật tiếp tục tăng thời gian qua gia hạn Supabase thật, cùng identity/IFrame, không ghi nhận pause event trong cửa sổ kiểm tra. Ép metadata expires_at của phiên thử để kích hoạt SDK; không đổi JWT TTL hoặc chờ hết hạn tự nhiên. Headless tắt âm thanh hệ thống, chưa đo âm thanh trên hai máy vật lý hay phiên nghe kéo dài nhiều giờ.

## Bố cục nghe nhạc và phản hồi thao tác — 14/11/2026

- Desktop từ 1100px dùng hai cột: player rộng 320–380px, hàng chờ dùng phần còn lại và hiện ngay cạnh player. Tablet bố trí video và điều khiển cạnh nhau; mobile xếp dọc. Giữ IFrame tối thiểu 200×200, không thay instance khi đổi tab hoặc đổi độ rộng.
- Sửa nguyên nhân khó thấy toast: trước đây tắt toast nổi khi có player và đưa thông báo vào player, nên dễ bỏ lỡ khi cuộn sang phần khác. Dùng một vùng thông báo chung, tính vị trí theo vùng màn hình đang thấy và tránh IFrame; hỗ trợ cuộn, resize, visual viewport. Thông báo có nút đóng, hỗ trợ bàn phím và không trượt qua video.
- Thêm spinner/aria-busy và khóa nút đang xử lý cho thêm bài, bình chọn, xóa/duyệt/sắp xếp, lịch sử, thư viện, quản trị, host và form. Tác vụ trên 450ms có toast đang xử lý, sau đó thay bằng kết quả/lỗi cùng ID. Hộp xác nhận chờ phản hồi; khi lỗi vẫn mở để thử lại. Hiển thị tải/tải đệm nhạc ngoài IFrame.
- Các lệnh người dùng có thông báo kết quả thống nhất; heartbeat/report tự động không tạo toast liên tục. Thêm playlist báo tiến độ và số bài đã gửi khi dừng giữa chừng, không báo thành công cho các bài chưa gửi.
- Kiểm tra: 18 ca unit/React liên quan đạt; chạy lại 13 ca feedback/listener sau chỉnh cuối đạt. Room E2E có 34 ca đạt qua lượt đầy đủ và lượt chạy lại, 2 ca bỏ qua trên project mobile vì chính ca desktop đã chạy toàn bộ độ rộng 320–2560px. Hai ca public WCAG desktop/mobile đạt; typecheck, lint, format, build và quét 15 client artifacts đạt. Đã xem ảnh layout desktop/tablet/mobile.
- Preview public đã cập nhật bundle `index-Dk52hwIr.js`; domain trả HTTP 200, health configured. Tunnel giữ nguyên; không thay database/migration hoặc phòng thật. Lượt hosted qua domain **12 bước PASS**: hai IFrame YouTube thật tăng thời gian, listener theo pause/resume, player compact cạnh queue, toast lưu cài đặt nằm trong viewport và không che video, đổi tab giữ nguyên IFrame. Tài khoản/phòng kiểm thử đã dọn. Đây là browser contexts headless tắt âm thanh hệ thống, không phải xác nhận âm thanh trên hai máy vật lý; chi tiết `PUBLIC_CHECK.md`.

## Vào lại phòng dễ hơn — 14/11/2026

- Trang chủ, màn hình nhập mã và đăng nhập có thẻ **Vào lại phòng** cho phiên đang là thành viên. Danh sách **Phòng của bạn** đưa phòng vừa nghe lên đầu, có nhãn **VỪA NGHE** và lời gọi vào lại rõ ràng. Link mời của phòng đã tham gia cũng cho vào thẳng, không gửi lại join/PIN.
- Rời phòng giữ phiên và membership. Khôi phục phiên Supabase khi mở lại trình duyệt; chỉ lưu ID phòng cuối theo từng user để sắp xếp. Danh sách lấy từ API nên không dùng ID đã lưu để cấp lại quyền đã bị thu hồi. Không lưu PIN hoặc tạo cơ chế token mới.
- Đổi nhãn đăng xuất khách thành **Quên phiên trên thiết bị này**, có mô tả khác với nghỉ nghe. Chỉ form tham gia chủ động được tạo khách; request nền sau đăng xuất/hết phiên không tạo identity mới. Cache danh sách phòng gắn user ID và xóa cache cũ khi đăng nhập tài khoản.
- Kiểm thử: bộ 62 unit/API/React PASS; thêm ba kiểm thử giữ phiên, chạy lại file API gồm 7 ca PASS. Room E2E đầy đủ **26 PASS**. Public E2E đạt 11/12 ở lượt đầu; một ca đo màu đúng lúc chuyển theme đã sửa chờ CSS transition kết thúc, hai ca accessibility desktop/mobile chạy lại PASS. Đã kiểm tra nút quay lại ở 320px và giao diện sáng/tối, xem ảnh desktop/mobile.
- `test-hosted.mjs --base-url https://roomtune.dzoanh.me --return-browser` đạt **12 bước**: rời/vào lại, khôi phục context trình duyệt từ storage đã lưu và theo link mời vẫn giữ cùng user ID; không gửi join/signup mới. Kiểm thử dùng tài khoản/phòng riêng, đã dọn xong. Ảnh `return-desktop-live.png`, `return-mobile-live.png`; báo cáo `PUBLIC_CHECK.md`.
- Build/typecheck, lint và kiểm tra 15 client artifacts PASS; phần quay lại tải riêng để giữ bundle trang chủ khoảng 410 kB. Preview public đã cập nhật; tunnel tiếp tục chạy. Không thay schema/database hoặc dữ liệu phòng thật.

Giới hạn: vào lại tự động dựa trên cùng trình duyệt và cùng domain còn phiên. Quên phiên, xóa dữ liệu trình duyệt, dùng ẩn danh hoặc chuyển thiết bị cần tham gia/đăng nhập lại. Chưa có đồng bộ phiên khách giữa thiết bị.

## Sửa lỗi lưu cài đặt ngày 14/11/2026

- Đã tái hiện lỗi “Hãy kiểm tra lại giới hạn đã nhập”: snapshot Supabase có thêm `room_id` và `updated_at`, trong khi form kiểm tra cả đối tượng bằng schema strict. Các giá trị người dùng chọn vẫn hợp lệ.
- Form chỉ gửi các trường cài đặt đã được kiểm tra; bỏ metadata chỉ đọc. Schema lệnh phía API vẫn strict, giữ nguyên giới hạn và quyền owner. Không đổi dữ liệu phòng thật hoặc migration.
- Fixture đã bổ sung metadata giống hosted để ngăn lỗi quay lại. Kiểm thử trước sửa thất bại đúng tại bước lưu; sau sửa cả desktop/mobile lưu được hai chế độ và giữ giá trị sau tải lại. 23 kiểm thử domain, build/typecheck, lint các tệp sửa, Prettier và quét 14 client artifacts PASS.
- Bản build mới đã cập nhật tại https://roomtune.dzoanh.me, tunnel đang chạy theo yêu cầu bật lại của người dùng. Xem `PUBLIC_CHECK.md` cho lượt kiểm tra form desktop/mobile với snapshot thật và tài khoản/phòng kiểm thử riêng.

## Bổ sung ngày 14/11/2026

- Đã thêm lựa chọn **Chỉ máy host / Tất cả thiết bị** tại Cài đặt phòng, chỉ owner thay đổi. Follower có IFrame nhìn thấy, bật/tắt nghe và âm lượng riêng; theo bài, pause/resume/seek từ host và dừng khi host mất lease. Chế độ chỉ host vẫn là mặc định.
- Đã thêm nút **Rời phòng** có chữ và icon ở thanh đầu trang trên desktop/mobile, mục tiêu chạm ít nhất 44px, hỗ trợ bàn phím và trả focus khi hủy. Rời phòng dừng player local, hủy Presence và nhả host nếu thiết bị đó đang giữ quyền. Tư cách thành viên, hàng chờ và tài khoản vẫn giữ.
- Migration `202611140001_device_playback.sql` đã được kiểm thử PostgreSQL cô lập, dry-run và áp dụng lên Supabase đã liên kết. Không sửa bốn baseline đã deploy.
- Unit/API/React: **62 PASS**; PostgreSQL: **25 PASS**; 18 ca room E2E desktop/mobile đã chạy, bốn ca lỗi nhãn/focus được sửa và chạy lại PASS; kiểm tra accessibility/320px và luồng liên quan sau sửa PASS. Xem `HOSTED_CHECK.md` cho bằng chứng mới nhất với dịch vụ thật.
- Khi triển khai bổ sung, tunnel ROOMTUNE được giữ tắt theo yêu cầu người dùng; sau đó đã bật lại theo yêu cầu mới. Dev local chạy ở `127.0.0.1:5173`. Đã sửa cách đọc mảng JSON trong script quản lý tiến trình cho Windows PowerShell 5.1.

Giới hạn: mỗi người cần bật nghe trên trình duyệt; không hứa phát khi khóa màn hình/đóng trang hay đồng bộ chính xác trong quảng cáo. Chưa kiểm thử âm thanh đồng thời trên hai thiết bị vật lý.

Kiểm chứng live: `test-hosted.mjs --browser` đạt **12 bước**, gồm hai browser contexts độc lập phát IFrame YouTube thật; thời gian quan sát host 13.1s và listener 12.8s, cả hai tăng liên tục. Listener theo pause/resume của host; rời phòng hủy iframe, host release được xác nhận trên DB. Đây là quan sát một lượt chạy, không phải cam kết độ lệch 0.3 giây. Test chạy headless, tắt âm thanh hệ thống. Ảnh trong `listening-mobile-live.png` và `listening-host-live.png`. Build, typecheck, lint và kiểm tra 14 client artifacts PASS; preview local đã khởi động lại với build mới.

## Trạng thái ngày 13/11/2026

Phase 13: đã triển khai frontend/backend/migrations, kiểm chứng local và migrate Supabase hosted do người dùng cung cấp. Kiểm thử Auth, RLS, private Realtime, queue/vote và YouTube API thật qua Worker local đã đạt 10 bước (HOSTED_CHECK.md), gồm chặn public channel và dọn dữ liệu kiểm thử. Đã cấp tài khoản chủ phòng được người dùng chỉ định. Chưa release Cloudflare production. Người dùng đã miễn quy trình PMP cho MusicBox, không tạo task PMP.

## Đã hoàn thành trong repository

- React/Vite strict TypeScript, Hono Worker + Static Assets, Supabase PostgreSQL migrations; pnpm lockfile, ESLint 10, Prettier, CI.
- Giao diện Việt dark/light, responsive 320px, landing/join/login/rooms/dashboard/search/library/history/host/admin/settings/profile, QR và trạng thái lỗi/offline.
- Auth adapters anonymous/email, Turnstile tùy chọn có reset token sau mỗi lần gửi, kiểm tra identity phía server và quyền room trong SQL; RLS/private channels/rate limits/audit.
- Queue FIFO/VOTING/FAIR/MANUAL, approval, limits, duplicate prevention, reorder, optimistic vote rollback, idempotency và retry giới hạn với cùng request key.
- Host lease/fencing/run ID, player hiển thị, controls/autoplay/heartbeat/watchdog/phím tắt; giữ player khi đổi tab, nhả quyền host; chống callback cũ và lưu vị trí để resume.
- Favorites, playlist CRUD/batch tối đa 20, history/audit phân trang, profile/export/xóa identity, đổi mã phòng.
- Service interfaces/adapters tách khỏi HTTP handlers, retention/metadata refresh, backup/restore script và docs tiếng Việt.

## Kết quả đã chạy

- Strict typecheck PASS; unit/API/React tests: **58 PASS**.
- PostgreSQL 17 thật: **23 PASS**, gồm 30 enqueue/vote đồng thời, permissions/RLS, playback race, heartbeat position và pg_dump/pg_restore sang DB riêng.
- Public E2E: **12 PASS**; room E2E fixture: **12 PASS** trên Chromium desktop/mobile. Axe WCAG A/AA không phát hiện violation tại các màn hình đã quét.
- Production build PASS; kiểm tra 12 client artifacts không thấy server-secret markers/key patterns. Dependency production audit không có advisory đã biết; peer check PASS.
- Lighthouse mobile trên landing production local: Performance **100**, Accessibility **100**, Best Practices **100**. Báo cáo HTML/JSON trong docs; không suy ra điểm cho phòng hoặc deployment thật.
- Đã xem ảnh landing desktop/mobile và host fixture. Preview built Worker trả HTTP 200 và CSP/Referrer-Policy đúng cấu hình; health phản ánh configuration_required khi thiếu keys.

## Phần cần tiếp tục

1. Thiết lập và kiểm tra Turnstile trước public rollout; Realtime private-only đã được xác nhận bằng kết nối thật.
2. Mở rộng kiểm tra autoplay/quảng cáo/seek/handover/reconnect và vận hành dài ngày. Đã xác nhận một video phát thật có âm thanh, chưa đại diện cho mọi video/trình duyệt.
3. Kiểm tra 30 browser/WebSocket clients trên staging, backup/restore Supabase hosted, CPU/quota/cron thực tế.
4. Deploy Cloudflare khi có account/quyền đích; xác minh CSP/static/queue sau deploy và rollback.

Credentials thật đã được người dùng điền trong .env/.dev.vars và không được in vào báo cáo. Đã chạy cả 4 migrations trên project được liên kết; không reset DB. Không tạo dịch vụ trả phí, không push hoặc deploy Cloudflare. Docker engine chưa chạy; DB tests dùng PostgreSQL cô lập. Auth/Realtime managed schemas trong DB test vẫn là fixtures; kiểm thử hosted là lượt riêng sử dụng dịch vụ thật.

Đã sửa hai lỗi chỉ lộ ra khi tích hợp thật: email.enable_signup=false của CLI tắt cả Email provider (đã bật lại sau xác nhận của người dùng), và native fetch của Cloudflare cần giữ receiver globalThis khi gọi từ YouTubeService. Đã kiểm thử host notices với Sonner thật; thông báo và nút theme nằm ngoài vùng iframe.

Lượt sửa playback tiếp theo: video “Nàng Thơ” (Zzn9-ATB9aU) trả YouTube error 150 trong trình nhúng. Player rỗng trước đây phát sinh error 2 che mất lỗi gốc. Đã chỉ khởi tạo iframe khi có video/run, nạp ID ngay trong constructor, chờ onReady mới điều khiển, giữ trạng thái pause khi phục hồi và không gọi play lại vì heartbeat/snapshot đổi. Thông báo giải thích lỗi nhúng và gợi ý chọn bản khác. Sửa history query bằng foreign key requested_by để hết PGRST201. Video “Em Về Đi Em” (sIKGC2VX63I) đã phát liên tục hơn một phút trong phòng thật; người dùng xác nhận nghe được. Thêm 4 regression tests; 2 host E2E desktop/mobile, build, lint và typecheck PASS.

## Ghi chú môi trường

Node 24.22.2, pnpm 11.25.0. Sandbox Windows chặn symlink/cache/socket và có lần làm test DB đứng; cây tiến trình test đã dừng, chạy lại ngoài sandbox được phê duyệt và PASS. Lỗi auto-review upstream của lần nâng dependency trước đã được giải quyết ở lần chạy sau: ESLint 10.14.0, jest-dom 6.9.1, Prettier 3.6.2 đã cài thành công. Lighthouse 13.6.0 không còn peer conflict của 13.0.0. Rollup còn cảnh báo vị trí annotation trong dependency Zod; build vẫn thành công, không tắt cảnh báo.

## Tệp và cách tiếp nối

Toàn bộ mã hiện ở workspace, Git chưa có commit/remote. Xem git status; không khởi tạo lại. Đọc REQUIREMENTS, PLAN, DECISIONS và FINAL_AUDIT trước khi tiếp tục. Các mục phụ thuộc credentials chưa được đánh dấu hoàn thành.

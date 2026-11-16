# Gợi ý nhạc theo phòng

Trạng thái ngày 16/11/2026: bản mở rộng bốn nguồn, bộ lọc và Xem thêm đã phát hành
và kiểm tra qua HTTPS tại https://roomtune.dzoanh.me. Lượt kiểm thử public nhận được
61 bài khám phá trong phòng mới; số lượng thực tế thay đổi theo nguồn và giới hạn phòng.
Bản thử riêng tại http://127.0.0.1:5180 vẫn hoạt động. Không có migration database.

## Cách dùng

Trong phòng, chọn **Tìm & thêm bài**, để trống ô tìm kiếm.

- **Nghe lại cùng phòng**: bài đã phát hoàn tất, ưu tiên bài phòng thường nghe và nghe gần đây.
- **Khám phá nhạc mới**: tổng hợp bảng nhạc YouTube tại Việt Nam, Mỹ, Hàn Quốc và Nhật Bản,
  ưu tiên kênh quen của phòng. Chọn **Tổng hợp / Việt Nam / Mỹ / Hàn Quốc / Nhật Bản** để lọc.
  Đây là khu vực của bảng nhạc, không phải xác định ngôn ngữ hay quốc tịch nghệ sĩ.
- **Thêm bài**: đưa vào hàng chờ theo quyền và giới hạn hiện có. Có trạng thái đang thêm,
  thông báo kết quả và chống bấm trùng. Không tự phát hoặc chuyển bài đang nghe.
- **Xem thêm**: khám phá hiện 12 bài ban đầu, mỗi lần mở thêm tối đa 12 bài và giữ nguyên các
  bài đã xem. Dòng đếm cho biết đang hiện bao nhiêu trên tổng số bài phù hợp. Bài quen hiện
  sáu bài ban đầu, cũng có nút xem thêm.
- **Đổi gợi ý**: chuyển nhóm 12 bài trong nguồn đang chọn, không gọi API thêm. Đổi nguồn
  cũng diễn ra ngay trên thiết bị và đưa về 12 bài đầu của nguồn đó.
- **Nhạc Việt / Chill / Acoustic / Lofi / Âu Mỹ / Ballad / Rap Việt / EDM / Tìm thêm: kênh**: tìm bằng thao tác chủ động.
  Bấm **Xóa tìm kiếm** để quay về gợi ý.

Phòng mới bắt đầu bằng khám phá; phần bài quen xuất hiện sau khi có lịch sử phù hợp.
Gợi ý dùng hoạt động của phòng hiện tại, không đọc thư viện cá nhân hay lịch sử phòng khác.
Đây là thuật toán của ROOMTUNE, không lấy trang chủ hoặc đề xuất cá nhân từ tài khoản YouTube.

## Xếp hạng và giới hạn

Đọc tối đa 300 lượt phát gần nhất và 500 mục hàng chờ đang hoạt động trong phòng.
Điểm bài quen gồm số lần hoàn tất × 4, độ gần đây `3 / (index + 1)` và cộng 2 nếu cùng kênh
với bài làm mốc. Bài làm mốc ưu tiên bài đang phát/chuẩn bị phát, tiếp đến hàng chờ rồi lịch sử.
Khám phá ưu tiên kênh quen, tối đa ba bài mỗi kênh để có sự đa dạng.

Loại bài đã nằm trong hàng chờ, vượt thời lượng tối đa của phòng, metadata bị đánh dấu
không khả dụng, hoặc có lần phát gần nhất FAILED/SKIPPED. Một lần phát hoàn tất sau đó
cho phép bài quay lại. Loại trùng giữa hai nhóm; trả tối đa 24 bài quen và 120 bài khám phá.
Đan xen các nguồn trước khi xếp theo kênh quen để một nguồn không chiếm toàn bộ danh sách.
Một bài xuất hiện trong nhiều bảng chỉ hiện một lần ở Tổng hợp nhưng vẫn nằm trong từng
bộ lọc nguồn tương ứng.

Nguồn khám phá dùng [YouTube videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list)
với `chart=mostPopular`, `regionCode=VN/US/KR/JP`, `videoCategoryId=10`, `maxResults=50`.
Số lượng thực tế phụ thuộc YouTube và bộ lọc của phòng; đây là giới hạn trên, không cam kết
luôn có 120 bài. Kiểm tra trực tiếp ngày 16/11/2026: các nguồn VN/US/KR trả 30 bài mỗi nguồn,
không có nextPageToken; chỉ tăng maxResults hoặc thêm phân trang không tạo thêm bài Việt Nam.
Lọc trạng thái công khai, cho phép nhúng, video live, giới hạn tuổi/vùng và thời lượng bằng
adapter hiện có. Metadata cho phép nhúng không đảm bảo mọi video sẽ phát trên mọi thiết bị;
cơ chế xử lý video lỗi của player vẫn được giữ.

## Độ trễ, hạn mức và lỗi

- Cache khám phá chung 30 phút cho từng nguồn chỉ lưu metadata công khai, không lưu xếp hạng
  riêng của phòng. Khóa `discovery:popular-music:{region}:v2`; cache tìm kiếm vẫn 10 phút với
  prefix `search:v1:`. Bốn nguồn được tải song song sau khi xác minh membership/dữ liệu phòng.
- Không gọi `search.list` tự động. Chặn tối đa 300 cache miss khám phá/ngày ở tầng ứng dụng;
  hạn mức thực của project YouTube vẫn áp dụng. Mỗi actor được đọc gợi ý 12 lần/phút.
  Nếu mỗi nguồn chỉ refresh một lần mỗi 30 phút, bốn nguồn dùng khoảng 192 refresh/ngày;
  yêu cầu đồng thời khi cache hết hạn có thể tăng số đó nhưng vẫn chịu ngưỡng chung.
- Client cache riêng theo phòng, danh tính, bài đang phát và thời lượng tối đa của phòng,
  freshness 5 phút; không polling và không refetch khi đổi focus. Xem thêm,
  đổi nhóm và đổi nguồn không dùng thêm quota.
- Timeout, lỗi mạng, hết quota hoặc phản hồi JSON/schema lỗi ở một nguồn không xóa bài quen
  hoặc các nguồn còn hoạt động: trả `discoveryUnavailable=true` và `unavailableRegions`, hiện
  thông báo/nút thử lại. Phân biệt nguồn lỗi với nguồn không còn bài phù hợp sau khi lọc.
- Nếu không đọc được dữ liệu phòng, hiện lỗi tải gợi ý và nút thử lại. Ô tìm kiếm/dán liên kết
  vẫn dùng được; các thao tác cần dịch vụ đang lỗi vẫn có thể báo lỗi tương ứng.
- Kiểm tra membership trước mọi đọc dữ liệu/cache/provider. Người bị thu hồi membership
  không đọc được feed. Response HTTP `no-store`; query client tách theo danh tính/phòng.

## Chạy thử và kiểm tra

```powershell
npm.cmd run build:game
npm.cmd run game:start
# Mở http://127.0.0.1:5180 → vào phòng → Tìm & thêm bài
```

Tên lệnh kế thừa workflow thử game nhưng build toàn bộ ứng dụng hiện tại. Build giữ nguyên
hash của `dist` và khôi phục deployment pointer; runtime riêng chỉ phục vụ thư mục client,
không chia sẻ `.dev.vars` hoặc Worker bundle. Khi đã chạy một bản thử cũ, dùng `game:stop`
trước khi build rồi `game:start` để nạp bản mới. Chỉ thao tác với runtime thử tại 5180.
Không chạy `npm.cmd run build` trong lúc chuẩn bị tính năng: lệnh đó ghi đè `dist` của public.

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run test:e2e:room -- --workers=2
node.exe scripts/check-client-secrets.mjs .roomtune/game-build/client
npm.cmd run test:hosted:recommendations -- --project-ref zhcnyadfkpszgdmesxvi
```

Kiểm thử hosted yêu cầu bản thử chạy, tạo tài khoản/phòng riêng rồi tự dọn đúng ID của lượt
chạy. Không sử dụng phòng thật. Gieo lịch sử PLAYED/FAILED trong phòng tạm để xác minh join
và xếp hạng, không coi đó là bằng chứng phát âm thanh. Dùng YouTube và Supabase/API thật;
desktop/mobile là hai browser context. Báo cáo ở
[RECOMMENDATIONS_HOSTED_CHECK.md](RECOMMENDATIONS_HOSTED_CHECK.md).

Sau khi người dùng yêu cầu phát hành, đúng build đã kiểm thử được chuyển sang public.
Chỉ restart preview; tunnel giữ nguyên. Giữ các chunk cũ để tab đang mở tiếp tục tải được.
Bản trước nằm trong `.roomtune/releases/recommendations-20261116-103606/previous`;
thư mục này có server secrets, không đưa vào Git hoặc phục vụ như static assets.

Kiểm tra lại public bằng lệnh sau (chỉ dùng khi được phép tạo/dọn tài khoản và phòng thử):

```powershell
npm.cmd run test:hosted:recommendations -- --project-ref zhcnyadfkpszgdmesxvi --base-url https://roomtune.dzoanh.me
```

Script chỉ chấp nhận bản thử loopback hoặc đúng HTTPS origin của `APP_BASE_URL`.
[Báo cáo public](RECOMMENDATIONS_PUBLIC_CHECK.md) ghi kết quả qua domain thật.
GitHub không tự deploy; lượt phát hành này không thực hiện commit/push mã nguồn.

# Tìm kiếm và thêm link YouTube

Bản sửa đã phát hành ngày 16/11/2026 lúc 19:19 giờ Việt Nam tại
https://roomtune.dzoanh.me. Bản thử riêng `http://127.0.0.1:5180` vẫn hoạt động.

Theo yêu cầu tiếp theo của người dùng, bản hiện tại đã bỏ hai trần tìm kiếm riêng
6 lần/phút/người và 80 lần/24 giờ. Không đọc/tăng/reset bucket `search:*` cũ.
Cache 6 giờ, xác thực, tư cách thành viên và chống spam API chung được giữ nguyên.
Xem [kiểm tra tìm kiếm và link trên public](SEARCH_LINK_PUBLIC_CHECK.md).

## Chẩn đoán bản cũ

SELECT lúc `2026-11-16T09:42:34Z`: `search:global` có `count=168`, mức chặn 80,
window bắt đầu `2026-11-16T01:16:40.299236Z`, mở lại `2026-11-17T01:16:40.299236Z`
(08:16:40 ngày 17/11 tại Việt Nam). Count bao gồm cả yêu cầu bị từ chối, không phải
số lần gọi YouTube thành công. Các bucket search/enqueue theo thành viên AE CTV được
kiểm tra đã qua cửa sổ một phút. Log public có HTTP 429 RATE_LIMITED ở search.
Không reset hoặc sửa bộ đếm để kiểm thử.

| Giới hạn ROOMTUNE       | Mức hiện tại                                     |
| ----------------------- | ------------------------------------------------ |
| Tìm kiếm theo người     | Không có trần riêng                              |
| Tìm kiếm mới chung      | Không có trần riêng                              |
| Thêm bài theo người     | 12 lần/phút, không dùng ngân sách tìm kiếm chung |
| API xác thực theo người | 180 yêu cầu/phút                                 |
| API ghi theo người      | 90 yêu cầu/phút                                  |

YouTube còn có quota riêng của Google Cloud project.
[Tài liệu chính thức](https://developers.google.com/youtube/data/determine_quota_cost)
đọc ngày 16/11/2026 ghi mặc định 100 `search.list`/ngày và 10.000 đơn vị/ngày cho
endpoint khác; `videos.list` tốn 1 đơn vị. Google reset ở nửa đêm Pacific, khác cửa
sổ 24 giờ ROOMTUNE cũ. Chưa đọc quota thực tế trong Cloud Console. Việc bỏ trần của
ROOMTUNE không thay đổi quota do Google cấp và không né kiểm soát của YouTube.

## Bản sửa

- Tự tìm sau khi ngừng gõ 650 ms, tối thiểu 2 ký tự. Đợi kết thúc composition khi
  dùng bộ gõ; Enter/nút Tìm vẫn có thể gửi ngay. Hủy timer khi gõ tiếp, xóa ô hoặc
  rời mục tìm kiếm. Kết quả trả muộn của từ khóa cũ không thay kết quả mới.
  Không tự refetch do focus, reconnect hoặc remount.
- Chuẩn hóa chữ hoa/khoảng trắng; cache dùng chung 6 giờ, key `search:vn:v2:` để
  tránh dùng kết quả lọc sai quốc gia cũ. Kiểm tra membership trước cache; enqueue
  vẫn xác minh metadata mới.
- Bỏ lỗi SEARCH_BUDGET_EXCEEDED/SEARCH_RATE_LIMITED vì không còn bucket tương ứng.
  Chống spam chung trả RATE_LIMITED; thêm bài trả ENQUEUE_RATE_LIMITED.
  Retry-After chỉ có khi biết thời gian chờ, không ghi 60 giây cho quota YouTube.
  Lỗi quota provider giữ YOUTUBE_QUOTA_EXCEEDED.
- Thẻ lỗi có nút xem gợi ý, dán link và mở tìm kiếm YouTube; lỗi ngắn hạn có nút
  thử lại đếm ngược theo header. Không điều hướng ra khỏi phòng.
- Link BAD `-q_S27LbNKU` (225 giây) bị loại do `blocked=['RU']`. Nay kiểm tra VN:
  từ chối khi blocked có VN hoặc allowed không chứa VN; allowed rỗng bị chặn,
  blocked rỗng được phép. Nguồn khám phá US/KR/JP không đổi quốc gia phát đích VN.
  [Ý nghĩa regionRestriction](https://developers.google.com/youtube/data/reference/rest/v3/videos#contentDetails.regionRestriction).
- Không đổi schema, quyền, hạn mức thêm bài, host hoặc cơ chế bỏ qua bài lỗi khi phát.
  Metadata hợp lệ không bảo đảm IFrame phát trên mọi thiết bị/quốc gia.

## Kiểm tra

Khôi phục debounce 650 ms: 5 unit tests (search panel + gợi ý) và 6 browser cases
PC/mobile PASS. Kiểm tra gõ nhanh chỉ gửi từ khóa cuối, chuẩn hóa không gửi trùng,
hủy khi xóa/rời màn hình, chờ bộ gõ kết thúc, Enter gửi ngay không lặp và kết quả
trả muộn không ghi đè từ khóa mới. Typecheck, lint và format PASS.

Sau khi bỏ trần tìm kiếm riêng: 57 unit/API tests và 4 browser cases desktop/mobile
PASS; typecheck, lint, format, isolated build và scan 21 client artifacts PASS.
API fixture xác minh 85 lượt tìm kiếm cache miss vẫn thành công dù bucket search cũ
bị chặn, đồng thời giữ membership, chống spam API chung và quota YouTube thật.
Hosted trial ngày 16/11/2026 lúc 11:47 UTC: tìm `bad` trả 12 kết quả, thêm link BAD
thành công. Tài khoản/phòng tạm được dọn; public vẫn giữ bundle `index-CeutjgZi.js`.

Baseline sửa link/quota: 280 unit/API/React tests, typecheck, lint và isolated build PASS. 6 browser cases
desktop/mobile PASS, gồm chiều rộng 320px, Axe search panel, không tự gửi lúc gõ,
thông báo daily limit, link radio vẫn enqueue, pending/chống gửi trùng/thử lại.
Đã sửa form bị xếp dọc theo CSS toàn cục sau lượt browser đầu; xác minh lại ảnh.
21 client artifacts qua secret marker scan.

`node scripts/test-search-link-hosted.mjs --project-ref PROJECT_REF` dùng trial,
tạo/dọn tài khoản/phòng tạm, không gọi search. Thêm `--expect-unavailable` để tái
hiện baseline cũ. Baseline trả VIDEO_UNAVAILABLE; bản sửa enqueue thật thành công.
Thêm `--check-search` để kiểm tra một lượt tìm `bad` qua trial đã bỏ trần; không
kết hợp với `--expect-unavailable`, không dùng để làm cạn quota hoặc reset counter.
Xem [SEARCH_LINK_HOSTED_CHECK.md](SEARCH_LINK_HOSTED_CHECK.md). Chưa kiểm chứng âm thanh.

Để kiểm tra bản public sau khi được phép phát hành, thêm
`--base-url https://roomtune.dzoanh.me --check-search`. Script chỉ chấp nhận đúng
HTTPS `APP_BASE_URL`, không cho chạy chế độ tái hiện lỗi cũ trên public. Kết quả
được ghi riêng vào `SEARCH_LINK_PUBLIC_CHECK.md`, giữ nguyên bằng chứng trial.

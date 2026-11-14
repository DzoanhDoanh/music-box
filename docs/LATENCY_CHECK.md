# Đo độ trễ API — 14/11/2026

Trước: 2026-11-14T07:38:58.954Z. Sau: 2026-11-14T08:00:55.260Z.
Nguồn gọi: cùng máy Windows chạy preview; public qua https://roomtune.dzoanh.me và Cloudflare Tunnel.
Mỗi thao tác bỏ một warmup, lấy 5 mẫu tuần tự và báo median. Không phải p95/load test hoặc phép đo
từ mạng của tất cả thành viên. Script `scripts/measure-api.mjs` tạo rồi xóa đúng tài khoản/phòng
thuộc lượt thử; cả hai lượt đã xác nhận cleanup. Dữ liệu chi tiết trong `.roomtune/latency-*.json`
bị Git ignore, không chứa token hay nội dung tin.

| Thao tác                 | Trước (ms) | Sau (ms) | Khoảng sau (ms) |
| ------------------------ | ---------: | -------: | --------------: |
| Public gửi chat          |        746 |      503 |         479–530 |
| Public đọc chat          |        483 |      484 |         474–509 |
| Public snapshot          |        483 |      492 |         483–662 |
| Public health            |         54 |       62 |           53–82 |
| Local gửi chat           |        728 |      503 |         463–537 |
| Local đọc chat           |        461 |      481 |         471–518 |
| Local snapshot           |        454 |      520 |         478–589 |
| Trực tiếp Supabase Auth  |        138 |      142 |         134–158 |
| Trực tiếp rate-limit RPC |        130 |      139 |         137–142 |
| Trực tiếp snapshot RPC   |        141 |      141 |         136–149 |

Gửi chat qua domain giảm **243ms / 32,6%** trong lượt đo. Đọc chat/snapshot không có cải thiện
có ý nghĩa; không tuyên bố mọi API đều nhanh hơn. Chênh lệch local/public và giữa hai lượt
bao gồm network/runtime noise. Mỗi lượt Supabase vẫn khoảng 130–145ms, ba giai đoạn phụ thuộc
(Auth → rate limits → transaction) còn khoảng 400ms trước overhead HTTP/preview/tunnel.

Trước thay đổi, write chờ general limit rồi write limit, chat còn đọc membership HTTP trước RPC.
Sau thay đổi, hai limit chạy song song sau Auth; membership/ban vẫn được kiểm tra trong transaction
trước receipt replay. Queue mutation không-enqueue cũng bỏ precheck lặp; enqueue giữ precheck trước
YouTube quota. Không cache token/quyền, không đổi SQL hoặc vùng dịch vụ.

Mẫu Server-Timing public gửi chat sau thay đổi:
`auth;dur=130.0, limits;dur=272.0, data;dur=141.0, total;dur=412.0`.
Limits là tổng thời lượng hai fetch song song; không cộng các nhóm để suy ra wall time.
Header chỉ chứa thời lượng và tên nhóm cố định, không ID/token/payload/path.

Phía giao diện, composer mở lại và bubble hiện sau ACK, không đợi thêm một lượt đọc lịch sử.
Refetch chạy nền để cập nhật thời điểm/tên từ server. Tin chưa ACK không được hiển thị là đã gửi;
lỗi vẫn giữ nháp/receipt, reconcile không nhân đôi và access denial ẩn cache ngay.

Độ trễ vẫn phụ thuộc đường mạng đến Supabase; số đo này không hứa phản hồi tức thì hoặc giống nhau
trên mọi máy. `withFeedback` chờ 450ms mới hiện toast loading, không trì hoãn bắt đầu request.

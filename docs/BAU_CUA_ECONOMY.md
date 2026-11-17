# Coin ảo, quỹ cái và quyết toán

Ví dùng chung toàn Supabase user ID. Đổi phòng/bàn, reconnect hoặc mở nhiều tab
không nhận lại coin. Danh tính ẩn danh mới vẫn là user ID mới; không tuyên bố chống
multi-account tuyệt đối và không fingerprint thiết bị. Không nạp/rút hoặc chuyển
coin trực tiếp giữa tài khoản; không có giá trị quy đổi.

| Chính sách mặc định | Điều kiện                                  |
| ------------------- | ------------------------------------------ |
| Khởi đầu 10.000     | Một lần khi mở ví cho user ID              |
| Mỗi ngày +2.000     | Một lần/ngày Asia/Ho_Chi_Minh              |
| Cứu trợ +1.000      | Tổng ví <200; cách lần trước ít nhất 6 giờ |

System admin không ẩn danh được đổi chính sách toàn hệ thống và điều chỉnh coin
có lý do/audit; owner chỉ quản lý luật phòng. Múi giờ hỗ trợ Asia/Ho_Chi_Minh hoặc
UTC. Khởi đầu 100–1.000.000; lượng bonus/ngưỡng 1–1.000.000; cooldown 1–72 giờ.
Đổi coin ban đầu chỉ tác động ví mới. Bonus có thể tắt; cứu trợ không tự cấp giữa
settlement và không hoàn tác hình phạt đã áp dụng.

## Bảo toàn coin

Tiền là số nguyên, ví không âm; tổng không vượt miền integer an toàn JavaScript.
Ledger ghi available_delta/reserved_delta, số dư sau và reason/reference duy nhất.
Grant/claim/receipt có khóa chống trùng, bao gồm cạnh tranh giữa phòng và nhiều tab.

Gộp stake theo sáu mặt. Với mỗi một trong 216 kết quả, tính tổng gross payout:
symbol vắng mặt trả 0; có n lần trả stake × (n+1). Collateral là max(0, gross−tổng
stake) lớn nhất của 216 kết quả. Escrow không được tính hai lần.

Ví dụ 500 vào riêng Cua cần khóa 1.500 của cái; 100 trên cả sáu mặt cần 0 quỹ ròng
vì 600 stake tự chi trả mọi kết quả. Không dùng phép ước lượng thay cho tính chính xác.

Khi quyết toán, người cược giải phóng reserved stake và nhận payout; cái giải
phóng collateral, nhận tổng stake−tổng payout. Tổng coin của các ví không đổi.
Cược mới/undo tính lại quỹ trong cùng giao dịch. Nếu không đủ coin/quỹ, cả thao tác
rollback. Hủy vòng hoàn coin đúng ledger, không tạo episode phạt.

## Episode phá sản

Kiểm tra tổng ví trước/sau settlement, kể cả các khoản reserve ở bàn/phòng khác.
Chỉ vượt ngưỡng từ trên xuống mới mở episode. Cùng episode không bị phạt lần nữa;
khi ví phục hồi đủ ngưỡng, lần phá sản sau có thể mở episode mới. Một bảng unique
user/episode bảo vệ execution. Thứ tự gỡ bài là requested_at DESC, id DESC.

Queue, ledger, episode, audit và outbox cùng commit; không dựa vào callback client
để xóa bài. Restore bài không tạo thêm coin, không thay playback và phải qua giới
hạn queue/member tính cả PENDING, QUEUED, PREPARING, PLAYING.

Xem [kiểm thử](BAU_CUA_TESTING.md) cho bằng chứng bảo toàn/concurrency và
[vận hành](BAU_CUA_OPERATIONS.md) cho đối soát và giới hạn tải chưa đo trên hosted.

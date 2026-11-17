# Cách chơi Bầu Cua Party

Vào phòng nhạc → **Trò chơi → Bầu Cua Party**, tạo hoặc chọn bàn. Người xem có
thể tham gia khi còn chỗ. Coin chỉ để giải trí, không nạp/rút, mua bán hoặc quy đổi.

## Một vòng chơi

1. Người đủ coin đăng ký cầm cái. Chủ phòng cũng có thể chỉ định người hợp lệ.
2. Cái bấm **Sẵn sàng · Mở vòng** khi có ít nhất một người chơi khác online.
3. Chọn chip 100/500/1.000 hoặc nhập số riêng nếu phòng cho phép, rồi bấm biểu tượng.
   Có thể cược nhiều ô, nhiều lần; chỉ coin server đã nhận mới được tính.
4. Hết giờ khóa cược. Cái bấm **Lắc bát**, rồi **Mở bát** khi nút được bật. Không
   thao tác thì hệ thống tự tiếp tục theo deadline khi có người mở bàn.
5. Xem kết quả, thay đổi coin và bảng thành tích. Có thể mở vòng mới, hoặc tự mở
   nếu chủ phòng bật và vẫn còn đủ người online.

Sáu mặt: **Bầu, Cua, Tôm, Cá, Gà, Nai**. Ba viên độc lập. Cược 500 vào Cua:

| Số mặt Cua | Coin nhận lại, gồm vốn | Lãi/lỗ |
| ---------- | ---------------------: | -----: |
| 0          |                      0 |   −500 |
| 1          |                  1.000 |   +500 |
| 2          |                  1.500 | +1.000 |
| 3          |                  2.000 | +1.500 |

Không phí. Cái không đặt cược trong vòng mình cầm cái và phải đủ quỹ cho mọi kết
quả. Hệ thống từ chối cược mới vượt giới hạn hoặc thiếu bảo đảm, không cho vay coin.
Rời bàn không hủy cược; tải lại, đổi tab/bàn không nhận lại coin ban đầu.

## Nhịp mặc định và quyền quản lý

WAITING_FOR_DEALER → BETTING_OPEN (20s) → BETTING_LOCKED (tối thiểu 3s + cửa sổ
thao tác 2s) → SHAKING (tối thiểu 4s + cửa sổ 2s) → REVEALING (5s) → SETTLING
(giao dịch nguyên tử) → RESULT (3s). Tổng khoảng 35–39s khi có client hoạt động.
Countdown có thể về 0 trong lúc chờ server; client không tự chốt kết quả.

Mặc định cái tối đa 5 vòng liên tiếp. Người chờ online, còn thành viên và đủ coin
được nhận lượt; hết người hợp lệ thì chờ. Chính sách mất cái có thể chọn luân phiên
hoặc dừng sau quyết toán. Owner/moderator được cấp quyền có thể pause, hủy trước
công bố và đóng bàn khi không có vòng đang chạy. Không được hủy để né kết quả đã mở.

## Phạt nhạc

Mặc định khi tổng ví (khả dụng + đang khóa) chuyển từ dương xuống 0 sau quyết toán,
gỡ tối đa 1 bài QUEUED mới nhất của chính người đó trong cùng phòng. Không gỡ bài
đang phát/đã phát/bỏ qua, bài người khác, bài ở phòng khác hoặc thư viện cá nhân.

Owner có thể tắt phạt, chọn ngưỡng dưới cược tối thiểu, gỡ 1–3 bài, chọn áp dụng
người cược/cái và phạm vi thông báo. Luật cược/thời gian/hình phạt được chốt lúc
mở vòng; đổi cấu hình không sửa các cược đã nhận. Quyền quản trị/hiển thị dùng
cấu hình hiện tại. Hộp xác nhận giúp owner kiểm tra luật mới trước khi lưu.

Không có bài phù hợp thì ghi bỏ qua; không ghi nợ để gỡ bài thêm sau này. Mỗi đợt
phá sản chỉ phạt một lần xuyên bàn. Cứu trợ không trả lại bài; owner hoặc moderator
được cho phép khôi phục riêng trong **Ví coin → Hình phạt trong phòng**, có kiểm
tra giới hạn queue, trùng bài, quyền thành viên và audit.

## Kiểm tra tính công bằng

Mỗi vòng có seed 32 byte ngẫu nhiên do server tạo, biểu diễn thành 64 ký tự hex
thường. Commitment là SHA-256 của **chuỗi UTF-8 seed**, không phải bytes giải mã hex.
Với counter bắt đầu 0, băm UTF-8 chuỗi:

    ROOMTUNE:BAU_CUA:v1:<round UUID thường>:<seed>:<counter thập phân>

Đọc lần lượt 32 byte digest; bỏ byte ≥252, lấy phần dư chia 6 cho đến đủ ba mặt.
Lặp counter nếu cần. Index 0–5 lần lượt là BAU, CUA, TOM, CA, GA, NAI. Seed công bố
từ REVEALING; vòng hủy cũng công bố seed để kiểm tra nhưng không trả thắng/thua.

Nút **Cam kết / Xác minh** hiển thị theo cấu hình. Khi bật, việc xác minh hash và
ba mặt chạy trên thiết bị. Tắt các nút chỉ đổi giao diện, không đổi thuật toán hoặc
bảo mật seed trước khi mở. Cam kết chứng minh seed không đổi sau công bố; không
chứng minh nhà vận hành không biết seed hoặc bảo đảm dịch vụ luôn sẵn sàng.

## Hiển thị và thành tích

Đồ họa 3D chỉ trình diễn kết quả server. **Đồ họa nhẹ**, **Bỏ hiệu ứng** và thiết lập
reduced motion hỗ trợ thiết bị yếu; kết quả chữ/hình vẫn hiển thị khi WebGL lỗi.
Âm hiệu mặc định tắt, bật riêng với nhạc.

Bảng thành tích tính tối đa 20 vòng được công bố, không cấp thêm coin. Vua Cua/Thần
Tôm là thắng ở mặt tương ứng; Cầm Cái Đại Tài là cái có lãi; Lội Ngược Dòng là có
lãi sau lần tham gia bị lỗ; Ba Lần Liên Tiếp là ba lần tham gia liên tiếp có lãi.
Hòa/lỗ cắt chuỗi; vòng hủy hoặc chưa quyết toán không được tính.

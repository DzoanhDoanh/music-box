# Sửa đếm bước và tự nhảy khi ra 1 — 17/11/2026

Đã public lúc **16:10 ngày 17/11/2026 (giờ Việt Nam)** cùng phần chọn hình quân,
áp dụng migration hosted và cập nhật bản thử 5180. Source của đợt này được gộp trong
đợt phát hành luật cố định lúc 19:47 cùng ngày.
Luật dưới đây áp dụng cho bàn mới hoặc bàn chờ được chủ động nâng luật.
Xem [thông tin phát hành](PIECE_SKINS_RELEASE.md).

Kiểm tra tiếp lỗi chọn quân sau phát hành: [bản sửa vùng bấm và nút điều khiển](CANGUA_INTERACTION_FIX.md)
(đã public lúc 19:47, không đổi dữ liệu ván đã lưu).

Yêu cầu tiếp theo đã thành [bộ luật cố định](CANGUA_FIXED_MOVEMENT.md): không cho tắt
nhảy/an toàn trong profile mới; đã public lúc 19:47. Phần dưới mô tả bản phát hành 16:10.

## Hành vi

- Bỏ qua ô xuất quân an toàn của màu khác khi đếm bước, dù ô trống hay có ngựa. Không
  dừng, đá hoặc đứng chồng trên ô đó. Ngựa tại ô xuất quân không cản đường.
- Khi bật nhảy cửa chuồng và tung 1, người chơi chọn ngựa; ngựa tự nhảy đến cửa kế tiếp
  nếu toàn bộ đoạn đường không bị cản và cửa đích trống. Không có menu chọn đi/nhảy.
- Nếu có quân cản trên ô thường hoặc cửa đích, xét đi một bước được tính. Ô đích trống
  thì đi, có đối thủ thì đá, có quân mình thì ngựa đó không đi được. Không vượt quân cản
  trên ô thường. Ngựa khác vẫn có thể được chọn nếu có nước hợp lệ.
- Ví dụ vị trí tương đối 13 là cửa, 14 là xuất quân màu khác: tung 2 đi tới 16. Tung 1
  nhảy tới cửa 27 nếu đường thoáng; nếu bị cản ở 16 thì chỉ đi tới 15. Nếu đối thủ đứng
  ở 15 thì đá đúng quân ấy. Vị trí 14 không tiêu tốn bước trong mọi ví dụ này.
- Giữ nguyên xuất quân, chặn xuất khi ô mình đã có ngựa, dừng ở cửa cuối 55, vào chuồng
  từ lần tung sau, lên bậc và xếp hạng. Không chạy vòng thứ hai.
- Tùy chọn tắt nhảy vẫn có hiệu lực. Tùy chọn không có ô an toàn vẫn tính các ô xuất quân
  như ô thường; lựa chọn này khác mặc định bảo vệ ô xuất quân.
- Hiệu ứng và nhãn tính theo bước hợp lệ: tung 6 có thể đi qua 7 tọa độ đã lưu, không
  tạo nhịp dừng trên ô xuất quân bị bỏ qua.

## Tương thích

`rules.movement = SKIP_STARTS_AUTO_JUMP` đánh dấu cách đi mới, độc lập với tọa độ/schema 2.
Không có trường này thì giữ luật đã lưu, cả khi tải lại, retry và chơi lại. Parser không
tự thêm trường vào ván cũ; không chuyển đổi tiến độ, lịch sử hay receipt.

Bàn đã lưu có thể đổi ở **Tùy chọn bàn → Tùy chỉnh luật → Áp dụng luật di chuyển mới →
Lưu luật chơi** khi đang chờ. Giữ các lựa chọn khác; mọi người phải bấm sẵn sàng lại.
Ván đang chơi/tạm dừng không đổi luật; sau Chơi lại có thể chỉnh ở phòng chờ.

Migration `202611170004_cangua_movement.sql` chỉ mở validator cho đúng trường/giá trị mới,
giữ danh tính hàm CHECK và trigger chống đổi luật giữa ván. Không sửa migration đã áp dụng,
không viết lại các ván đã lưu trên hosted.

Migration đã được áp dụng trước runtime/client mới. Sau khi có bàn dùng luật mới,
không rollback về runtime chưa đọc được trường `movement`.

## Kiểm chứng

- Unit/API: 408 test đã kiểm chứng (lượt toàn bộ 405 đạt, sau đó bổ sung 3 mô phỏng ván;
  chạy lại suite di chuyển 26/26 đạt). Bao phủ mọi màu, toàn đường và các mặt xúc xắc;
  ô xuất quân trống/có ngựa, chặn/đá
  chính xác, ưu tiên nhảy, fallback, sáu bước qua bảy tọa độ, cấm client ép STEP khi phải
  nhảy. Mô phỏng ván 2/3/4 người hoàn thành, tải lại và rematch giữ nguyên quy tắc.
- PostgreSQL cô lập: 84 nhóm đạt, gồm migration, đọc luật cũ, validate luật mới, retry/CAS,
  đổi luật khi chờ và cấm đổi giữa ván; suite quản lý phòng/bàn tiếp tục qua.
- Browser: 40 kịch bản đạt, 2 trường hợp mobile bỏ qua có chủ đích vì đã chạy ma trận desktop.
  Lượt đầy đủ 39 đạt, một selector còn dùng nhãn checkbox cũ; cập nhật selector và chạy lại
  riêng ván bốn trình duyệt đạt (tạo bàn, ngồi ghế, sẵn sàng, hết ván và chơi lại).
  Tám kịch bản mới trên desktop/mobile bao phủ một lần bấm tự nhảy, fallback một bước,
  mất phản hồi rồi tải lại/xác minh bằng cùng request ID, nâng luật ở bàn chờ.
- Đã xem ảnh desktop/mobile, kiểm tra bố cục tới 320×568 và 844×390; luật mới không thêm
  menu chọn đi/nhảy. Các kiểm thử giữ iframe nhạc và lệnh nhạc không đổi đều qua.
- Typecheck, lint, format và `git diff --check` đạt. Build riêng tại `.roomtune/movement-build`
  thành công: entry `index-lzNF0QUa.js`, game `GameHub-vgZhg7Xz.js`. Script xác nhận hash
  `dist` và con trỏ deploy giữ nguyên; quét 26 client artifacts không thấy mẫu server secret.
  Cảnh báo chunk chính trên 500 kB và chú thích của dependency Zod vẫn còn như trước.

Không dùng phòng của người dùng để kiểm thử. Fixture browser ở 5175 và PostgreSQL ở
55439 tách khỏi hosted Supabase. Khi phát hành, preview 4173 được restart riêng và
tunnel giữ nguyên; kiểm thử hosted dùng phòng/tài khoản riêng rồi dọn đúng ID.

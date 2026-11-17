# Kiểm tra lỗi chọn quân — 17/11/2026

Đã public lúc **19:47 ngày 17/11/2026 (giờ Việt Nam)** cùng
[bộ luật di chuyển cố định](CANGUA_FIXED_MOVEMENT.md). Không thay đổi migration
004/005, dữ liệu ván đã lưu hoặc luật của ván đang chơi.

## Lỗi tái hiện được

- Vùng bấm cũ là hình tròn bán kính 0,52 ô; bấm góc ô có quân hợp lệ không gửi nước
  đi. Browser regression trước sửa cho kết quả quân vẫn ở 0 thay vì tới 6.
- Vòng bấm cũ vượt ranh giới ô; quân bị vô hiệu hóa vẫn tham gia nhận pointer.
  Đã bỏ vùng chồng này và kiểm tra bấm sát quân đối thủ ở các cửa cạnh ô xuất quân.
- Ô đích sáng trước đây chỉ là trang trí. Người chơi bấm vào đó không có hành động.
- Nút chọn quân trên điện thoại xếp bốn cột rất hẹp. Bản sửa chuyển thành hai cột;
  màn hình ngang dành thêm chỗ cho phần điều khiển.

Ván người dùng báo đã bị xóa nên không thể xác nhận chính xác vị trí, xúc xắc hay
bộ luật của ván đó. Những kết luận trên dựa vào tình huống dựng lại, không dựa vào
một bản ghi ván đã khôi phục.

## Hành vi sau sửa

- Bấm trong cả ô chứa quân hợp lệ để đi; hình trang trí và quân không được đi không
  chặn thao tác với ô bên cạnh hoặc ô đích.
- Có thể bấm ô đích khi chỉ có một nước đi tới ô đó, kể cả ô đang có quân đối thủ
  được phép đá. Nếu nhiều quân cùng có thể tới một ô, người chơi phải chọn quân theo
  số; không tự chọn quân thay người chơi.
- Bàn luật cũ có lựa chọn đi/nhảy vẫn giữ bước chọn. Bấm ô đích hoặc dùng Enter/Space
  sẽ gửi đúng loại nước đi đã chọn. Khóa thao tác đang gửi và receipt vẫn áp dụng.
- Nút chọn quân có hai cột trên điện thoại, giữ chiều cao tối thiểu 44 px và nội dung
  đủ đọc; ô trên bàn nhỏ có thể dùng nút số tương ứng.

## Kiểm chứng luật

Không tìm thấy sai lệch mới trong engine ở các tình huống đã dựng. Bổ sung kiểm tra
576 cách bố trí/sắp số quân, trên bốn màu, với quân đi được và quân bị chặn cùng tồn tại:

- Bỏ qua ô xuất quân an toàn màu khác, dù có quân đứng trên đó; không tốn bước,
  không dừng trên đó và không đá quân tại đó.
- Ra 1 tự nhảy nếu đường/cửa trống, nếu bị cản thì xét đúng một bước hợp lệ.
- Không xuất thêm khi ô xuất quân đang có quân mình; vẫn có thể đi quân ở ngoài.
- Không vượt cửa cuối; vào/lên chuồng theo đúng số, không xuyên hoặc chồng quân.
- Hoán đổi số thứ tự bốn quân không làm mất nước đi của quân khác. Thử nước đi không
  hợp lệ không làm thay đổi state đầu vào.

Luật bỏ qua ô xuất quân áp dụng cho `SKIP_STARTS_AUTO_JUMP` với `safe: STARTS` và
profile mặc định mới `SPAWN_ONLY_AUTO_JUMP`. Ván lưu theo luật cũ vẫn giữ cách đếm
cũ; không tự sửa luật hoặc vị trí giữa ván.
Xem [cách nâng luật khi bàn đang chờ](CANGUA_FIXED_MOVEMENT.md).

## Xác minh kỹ thuật

- Toàn bộ unit/API: **418/418 đạt**, gồm 106 test engine/an toàn/di chuyển/game API.
- Browser chạy bằng fixture riêng trên cổng 5175, không dùng phòng thật. Kiểm tra
  tọa độ chuột/chạm sát góc ô, sát quân bảo vệ, bốn màu, hình ngựa/siêu nhân, cửa
  chuồng và bậc chuồng; ô đích đá quân; bấm lặp; bàn cũ; nút chọn quân và màn hình nhỏ.
- Typecheck, lint, định dạng và diff check đạt. Build nằm riêng trong
  `.roomtune/move-interaction-build`; helper kiểm tra `dist` không đổi và khôi phục
  `.wrangler/deploy/config.json`. Giai đoạn kiểm tra này không restart runtime;
  bản phát hành sau đó được ghi trong [CANGUA_FIXED_MOVEMENT.md](CANGUA_FIXED_MOVEMENT.md).

- Browser toàn bộ: 64 đạt, 3 bỏ qua có chủ đích, phát hiện một lỗi tràn điều khiển ở
  320×568. Sau khi sửa, chạy lại đầy đủ hai suite layout/interaction: **23 đạt, 1 bỏ
  qua có chủ đích**, gồm trường hợp vừa lỗi. Tổng cộng 65 kịch bản khác nhau đã đạt
  qua các lượt; ba trường hợp bỏ qua là luồng/ma trận đã chạy ở desktop.
- Đã xem ảnh desktop 1440 px, điện thoại 390/320 px và ngang 844×390. Trên màn hình
  320×568 bàn cờ thu nhỏ để giữ toàn bộ nút trong màn hình; dùng nút số khi ô quá nhỏ.
  Ảnh cuối lưu trong `test-results/game-interaction-final/`.
- Build kiểm tra riêng: `index-CTjSb95k.js`, `GameHub-8sET42P8.js`, `GameHub-iUTkBDGQ.css`.
  Quét 26 client artifacts không thấy mẫu khóa server. Cảnh báo chunk chính trên
  500 kB và chú thích dependency Zod vẫn là các cảnh báo build có sẵn.

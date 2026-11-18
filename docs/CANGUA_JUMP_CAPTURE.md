# Nhảy đá quân tại cửa chuồng — 18/11/2026

Bản sửa thuộc [bản phát hành 18/11](RELEASE_2026-11-18.md). Không cần migration
database; không ghi lại ván, vị trí hay luật đã lưu.

## Quy tắc được sửa

- Ra **1**, đường tới cửa chuồng kế tiếp không có quân chắn và cửa đích trống
  hoặc có đối thủ: nhảy đến cửa. Nếu có đối thủ, đá đúng quân ở cửa đó về nhà.
- Cửa chuồng là **ô mũi tên trên đường chung**, không phải dãy bậc 1–6 riêng.
- Quân mình ở cửa đích hoặc quân bất kỳ trên ô thường giữa đường vẫn chặn nhảy.
  Khi đó xét nước đi một bước hợp lệ, kể cả đá đối thủ đúng tại đích một bước.
- Ô xuất quân an toàn vẫn được bỏ qua theo luật bàn, không chặn và không bị đá.
- Chỉ đến cửa kế tiếp, không vượt cửa của mình, không vào bậc chuồng bằng cùng
  nước nhảy và không được thêm lượt vì đá quân.
- Bàn tự động vẫn chỉ chọn quân; không được ép đi thường khi có thể nhảy.
  Ván v2 cũ còn lựa chọn STEP/JUMP giữ cách chọn; nước JUMP cũng được đá tại cửa.
  Luật Ludo v1 không đổi.

Ví dụ đỏ ở tiến độ 2, vàng ở tiến độ 41 (cùng ô cửa xanh lá số 13 trên đường
chung). Ra 1 và đoạn 3–12 trống: đỏ nhảy đến 13, vàng về nhà. Nếu có quân ở ô 8,
đỏ chỉ đi một bước đến 3 nếu hợp lệ. Nếu cửa 13 là quân đỏ thì không nhảy.

## Nguyên nhân và cách sửa

Engine cũ kiểm tra `!occupied(gate)`, nên đối thủ ở đích bị xem như vật cản giữa
đường. Nay dùng cùng điều kiện hạ quân cho STEP/JUMP: đích không phải ô an toàn
và không có quân mình. Việc kiểm tra chướng ngại chỉ tới trước ô cửa. Hàm capture
đã có xử lý đưa đối thủ về nhà và ghi sự kiện; hiệu ứng dùng sự kiện đã commit.
Frontend và máy chủ dùng chung engine. Mô tả luật trong trò chơi đã cập nhật.

## Kiểm thử

154 kiểm thử engine/API liên quan đạt: bốn màu × bốn cửa × ba màu đối thủ,
đường vòng qua tọa độ 55→0, chắn giữa đường/cùng màu tại đích, đi qua ô xuất quân,
nhảy khi ra 1, gửi lại request, chuyển lượt, snapshot tải lại và hiệu ứng đá quân.
32 kiểm thử trình duyệt desktop/mobile đạt, gồm hai người quan sát cùng ván,
một lần bấm nhảy đá đúng quân, tải lại không đi thêm lần nữa và mô tả luật mới.
Auth/Realtime trong browser suite là fixture cục bộ; chưa kiểm thử bản sửa trên
hosted hoặc thiết bị vật lý.

Typecheck, lint và format đạt. Build cô lập qua `scripts/build-bau-cua.mjs` đạt,
32 client artifacts qua secret scan heuristic. Public/trial artifacts và deploy
pointer không đổi; không restart runtime hay áp dụng migration hosted.

Bản sửa được phát hành cùng cấp coin, hiển thị cược Bầu Cua và bàn cờ 3D/K/O.

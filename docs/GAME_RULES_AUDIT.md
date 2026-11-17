# Rà soát luật và bàn cờ — 17/11/2026

## Yêu cầu đã xác nhận

- Đối thủ cách 3 bước: tung 2 đi được, tung 3 đá, tung 4–6 không vượt qua.
- Ra 1 có thể nhảy tới cửa chuồng kế tiếp khi đoạn đường trống.
- Ô cuối của vòng là cửa lên chuồng của chính mình; ô kế tiếp trên đường chung là ô xuất quân.

Không coi một biến thể cờ cá ngựa là luật duy nhất. Các mặc định về xuất quân, thêm lượt và
xếp chuồng được ghi trong [bộ luật ROOMTUNE v2](GAME_RULES_V2.md).

## Lỗi và sửa đổi

Engine cũ chỉ kiểm tra ô đích. Với quân đỏ ở tiến độ 10, đối thủ ở ô chung 13 và tắt ô an toàn,
tung 4–6 vẫn được đi xuyên qua đối thủ. V2 kiểm tra từng ô giữa đường; quân mình cũng cản.
Ô đối thủ chỉ bị đá nếu là ô đích của nước đi thường đúng số bước, không có vật cản trước nó.

Đường cũ có 52 ô theo Ludo. Số ô không tự nó chứng minh bàn sai. Tuy nhiên, cửa thẳng hàng với
bậc 1 nằm ở chỉ số chung 50/11/24/37, còn engine đi thêm một ô tới 51/12/25/38 rồi mới vào
chuồng, gây rẽ chéo cả bốn màu. Phần trang trí trung tâm còn phủ lên bậc 6.

Bàn v2 có 56 ô nối cạnh, không đi chéo góc. Bốn ô xuất quân là 0/14/28/42; cửa tương ứng
là 55/13/27/41. Cửa nằm ngay trước xuất quân và nối cạnh với bậc 1. Cả sáu bậc đều được đánh
số, không bị tâm bàn che; mũi tên và viền cửa giúp phân biệt với ô xuất quân.

Ra 1 hiện hai lựa chọn nếu hợp lệ. Bấm chọn ngựa chưa tự nhảy: người chơi phải chọn nước.
Ô đích và đường nhảy lấy từ engine dùng chung; API chỉ nhận quân/loại nước, không nhận ô đích.
Hiệu ứng đi theo từng ô của đường đã commit, kể cả chặng nhảy 14 ô và đoạn cửa–chuồng.

## Tương thích và dữ liệu

- Ván mới từ giao diện mới dùng schema 2 / CANGUA_V2; ván cũ giữ schema 1 và luật cũ.
- Rematch không thay phiên bản; lịch sử cũ không bị diễn giải theo bàn mới.
- Bản SQL bổ sung giữ validator v1, kiểm tra vị trí v2 đến 61 và cấm chồng quân.
- Trigger chặn đổi schema và đổi luật khi ván đang chơi. Quyền thành viên, CAS, receipt,
  RLS và kênh Realtime riêng tư tiếp tục dùng cơ chế hiện có.
- Game không ghi vào hàng chờ, playback, âm lượng hay quyền host nhạc.

## Kiểm chứng

`tests/unit/cangua-engine.test.ts` kiểm tra đường đi liên tục, duy nhất, tất cả màu và mọi
vị trí gặp quân cản; đồng thời kiểm tra nhảy, vào chuồng, leo bậc, timeout, khôi phục,
phiên bản và mô phỏng đủ ván 2/3/4 người. Các test Ludo cũ giữ fixture v1 riêng.

`scripts/test-cangua-db.mjs` chạy cùng suite PostgreSQL thật ở máy local: validation,
đá/chặn qua service, receipt của nước nhảy, vị trí bậc 6, kết quả, rematch và bất biến luật.
Toàn bộ **68 nhóm kiểm tra database** đã qua; dùng dữ liệu thử riêng, không dùng Supabase hosted.

Kiểm thử trình duyệt dùng fixture riêng tại cổng 5175, không thao tác phòng thật. Runner
frontend dùng `vite.game-fixture.config.ts` độc lập với workerd và bỏ qua thư mục build/log.
Ván bốn người trong browser dùng chuỗi xúc xắc có kiểm soát; các ván nhiều người với chuỗi
xúc xắc giả ngẫu nhiên được kiểm tra riêng trong engine suite.

- **335 test** unit/API/React đã qua (`npm.cmd test -- --maxWorkers=2`).
- **68 nhóm** PostgreSQL đã qua, gồm cả backup/restore vào database thử riêng.
- Suite browser có 20 kịch bản thực thi và 2 trường hợp bỏ qua do đã chạy ma trận viewport
  ở desktop. Lượt đầy đủ: 19 qua, phát hiện 1 lỗi tràn điều khiển ở landscape 844×390.
  Sau sửa CSS, lượt chạy lại phần chọn nước và layout: **3 qua, 1 bỏ qua**. Không còn lỗi mở.
- Luồng bốn trình duyệt tạo/ngồi ghế/sẵn sàng/chơi hết ván/rematch đã qua; khôi phục receipt,
  mất sự kiện, bàn phím, chat và giữ nguyên iframe nhạc đều đã qua.
- V2 được kiểm tra tại 1366×768, 1024×768, 390×844, 320×568 và 844×390: board/điều khiển/
  hai lựa chọn đi–nhảy nằm trong viewport, không cuộn. Desktop/mobile dark/light qua axe
  WCAG 2 A/AA; đã mở và xem ảnh desktop dark và mobile light sau sửa.
- Typecheck, ESLint, Prettier và `git diff --check` đạt. Build cuối ở
  `.roomtune/cangua-v2-build` đạt; script kiểm tra hash `dist` không thay đổi và khôi phục
  con trỏ Wrangler. Quét client artifacts không thấy dấu hiệu server secret đã biết.
- Build vẫn có cảnh báo kích thước chunk chính trên 500 kB và chú thích của dependency Zod;
  không có lỗi build. Kiểm tra hosted của đợt phát hành được ghi riêng trong
  [bằng chứng public v2](CANGUA_V2_PUBLIC_CHECK.md); chưa kiểm tra thiết bị vật lý.

Ảnh fixture: [desktop tối](cangua-v2-desktop-dark.png),
[desktop sáng](cangua-v2-desktop-light.png), [mobile tối](cangua-v2-mobile-dark.png),
[mobile sáng](cangua-v2-mobile-light.png).

## Phạm vi phát hành

Đã commit/push `66f8053` lên `master` và `codex/voice-lucky-wheel`, áp dụng migration
`202611170001_cangua_v2.sql` và thay public lúc 11:06 ngày 17/11/2026 (giờ Việt Nam).
Bản thử local cũng dùng build mới. Không tự đổi ván đang chơi; cần tải lại trang và tạo
bàn mới để dùng v2. Chi tiết xác minh, backup và giới hạn khôi phục nằm trong
[bằng chứng public v2](CANGUA_V2_PUBLIC_CHECK.md).

# Bàn cờ 3D và hiệu ứng K/O — 18/11/2026

Người dùng đã cho phép commit, push và public bản này cùng các thay đổi
Bầu Cua/cấp coin/nhảy đá. Phạm vi và bằng chứng phát hành được ghi trong
[bản phát hành 18/11](RELEASE_2026-11-18.md).

## Giao diện

- Bàn và cả 16 loại quân được dựng bằng Three.js / React Three Fiber đã có trong
  dự án. Mô hình tạo từ hình học cục bộ, không tải ảnh/font/model bên ngoài.
- Bàn nổi có viền kim loại, vùng nhà bốn màu, ô đường đi/chuồng có độ dày, ánh
  sáng, bóng đổ và góc nhìn có thể xoay/zoom. Tọa độ vẫn dùng chung `board-geometry` với
  bàn phẳng; không thay luật hay tiến độ quân đã lưu.
- Ngựa, siêu nhân, anh hùng mặt nạ, robot, ninja, động vật và biểu tượng có hình
  khối riêng. Số quân, vòng sáng quân hợp lệ, đích đi và nút số vẫn rõ ràng.
- Nước đi thường nảy qua từng ô; nhảy có quỹ đạo cao. Khi quân đến đích, đối thủ
  bay về nhà; tia sáng khi hoàn thành. Xúc xắc giữ hiệu ứng khối 3D
  và kết quả authoritative sẵn có, không tạo số giả.
- Khi đá quân: vòng tích năng lượng và vệt sáng theo quân tấn công; khi chạm
  đích có ba vòng xung kích, tia sáng, chớp sáng cục bộ và mảnh năng lượng.
  Đối thủ tung lên/xoay về nhà trong 900 ms; callout **ĐÒN KẾT LIỄU — K/O**
  và hiệu ứng va chạm kéo dài tối đa 1.45 giây theo đồng hồ hoạt ảnh.
  Chế độ Rõ nét dùng 72 mảnh, Nhẹ dùng 24 mảnh; dùng instancing, không thêm dependency.
  Lớp hiệu ứng không nhận pointer và không khóa lượt tiếp theo, không thêm âm
  thanh tự phát hoặc thay nhạc. Reduced motion/tab ẩn tiêu thụ sự kiện và dừng
  hiệu ứng, không diễn lại khi bật trở lại. Snapshot trùng không phát lại.
- Nút **Phẳng / Bàn 3D** nằm ngay trên bàn. Mặc định phẳng và lựa chọn đã lưu
  được giữ theo yêu cầu trước. Menu Tùy chọn bàn vẫn đổi góc nhìn được.
- Nút **Thử hiệu ứng** ở góc phải bàn 3D mở danh mục, sân khấu quân mẫu,
  **Xem thử K/O**, **Phát lại** và **Dừng**. Dùng skin của người xem nếu có.
  Preview chỉ nằm trong trình duyệt hiện tại, không gửi lệnh hoặc dựng GameState
  giả cho phòng. Đóng cửa sổ sẽ hủy renderer và hoạt ảnh; không đổi góc nhìn bàn thật.
  Tôn trọng reduced motion và cô lập lỗi WebGL của cửa sổ xem thử.
  Thêm hiệu ứng bằng một mục trong `board-effects.tsx`: renderer, nhãn và
  quỹ đạo quân mẫu; giao diện danh mục tự lấy các mục này. Gameplay và preview
  dùng chung renderer/callout, không có hai bản hiệu ứng độc lập.
- Kéo chuột trái để xoay, lăn chuột để zoom. Cảm ứng dùng hai ngón xoay/chụm;
  chạm một ngón vẫn chọn quân. Có nút xoay trái/phải, zoom và đặt lại góc nhìn.
  Khi zoom lớn, mép bàn có thể nằm ngoài khung; thu nhỏ hoặc đặt lại để xem toàn bàn.
- Mặc định **Rõ nét**: DPR 2–3, tối đa 8 triệu pixel, bóng 2048² và texture
  engraving 2048². Nút **Nhẹ** giảm DPR về 1 và bóng 512² cho máy yếu.
- Chunk 3D chỉ tải khi bật, render theo nhu cầu. Reduced motion, tab ẩn hoặc bàn ngoài viewport dừng hiệu
  ứng. Lỗi khởi tạo/mất WebGL trở về bàn SVG, không mất lượt hay gửi lệnh game.

## Tính đúng đắn của hiệu ứng

`scene-motion.ts` dùng cùng bộ kiểm tra sự kiện liên tiếp của `committedMotion`:
đúng bàn, vòng, phiên bản, quân và nước đi đã xác nhận. Reload, retry receipt,
missed version và rematch không diễn lại nước đi. Ô xuất quân bị bỏ qua theo
đúng profile của ván; hiệu ứng không gửi API, thay kết quả hoặc trì hoãn nút đi.
Các hit target HTML chiếu theo cùng camera với mô hình, hỗ trợ chuột, cảm ứng,
Tab/Enter/Space; quân không được đi không chặn nút đích bên dưới. Vùng bấm
theo camera khi xoay/zoom/resize; nhãn số và vòng sáng trang trí không chặn
ô đích. Kéo trên quân không gửi nước đi; nhả tay rồi chạm bình thường vẫn đi được.
Camera chỉ thay đổi hiển thị cục bộ, không cập nhật dữ liệu ván.

## Kiểm chứng

- 156 kiểm thử unit/engine/API liên quan đạt, gồm đường đi 3D, bỏ qua ô xuất
  quân, nhảy đá cửa và không diễn lại sự kiện.
- 44 ca browser desktop/mobile đạt, 2 ca lặp ma trận/GPU bỏ qua có chủ đích.
  Gồm render đủ 16 skin, chạm/bàn phím, capture, duy trì tùy chọn qua reload,
  lost WebGL fallback, dark/light axe, bố cục 320×568 tới 1440×1000, ô xuất
  quân/chuồng và việc giữ nguyên iframe nhạc.
- Lượt kiểm tra độ nét/camera mới: 14 ca browser đạt, 2 ca ma trận/GPU lặp bỏ
  qua có chủ đích (`board-3d.spec.ts`, `layout.spec.ts`). Bao gồm kéo từ quân
  đang được đi, wheel, hai ngón xoay/pinch, thu nhỏ rồi chạm ô bắt quân, resize
  sau khi xoay, đặt lại camera, kiểm tra độ phân giải canvas khi đổi chất lượng,
  các màn 320×568/844×390 và keyboard. Kiểm tra iframe nhạc thực hiện khi bàn
  3D đang mở, gồm thao tác Space; không remount iframe hoặc gửi pause.
- Lượt kiểm tra kết liễu: 11 kiểm thử unit quỹ đạo/nhảy đá đạt; 18 ca browser
  desktop/mobile đạt và 2 ca lặp bỏ qua (`capture-fx`, `board-3d`, `layout`).
  Có kiểm tra nổ tại va chạm, vẫn tung xúc xắc lượt sau, hết hiệu ứng, snapshot
  trùng, reload, reduced motion bật/tắt và chế độ Nhẹ. Không thao tác ván thật.
- Lượt kiểm tra nút thử hiệu ứng: 3 kiểm thử unit quỹ đạo, 4 ca browser
  desktop/mobile cho danh mục/phát lại/dừng, bàn thật và nhạc giữ nguyên,
  trả focus, axe, màn 320×568/844×390, reduced motion và lỗi WebGL cô lập đều đạt.
  Kiểm tra hồi quy thêm 10 ca browser cho camera, chọn quân/đích đi, va chạm
  và nhạc đều đạt. Ảnh cửa sổ xem thử desktop/mobile đã được kiểm tra trực quan.
- Typecheck và lint phạm vi thay đổi đạt. Build riêng bằng
  `scripts/build-bau-cua.mjs`, không ghi vào public `dist`, bản thử 5180 hoặc
  con trỏ deploy. Client scan là heuristic, không phải audit bí mật toàn diện.
- Browser sử dụng fixtures; chưa đo FPS/audio trên điện thoại vật lý. Phần 3D
  không cần migration database mới.

Ảnh fixture: [desktop](ludo-3d-desktop.png), [mobile](ludo-3d-mobile.png).

## Chạy thử

Bản thử riêng: `http://127.0.0.1:5181`. Vào phòng → Trò chơi → Cờ cá ngựa →
mở bàn → **Bàn 3D**. Cổng này chỉ mở trên máy chạy dự án. Bản thử dùng chung
Supabase với public, vì vậy nên tạo bàn mới để thử thay vì thao tác vào ván
người khác đang chơi. Chuyển chế độ hiển thị không làm thay đổi dữ liệu ván.
Để xem hiệu ứng mà không đi quân thật, chọn **Thử hiệu ứng → Xem thử K/O**.
Có thể phát lại hoặc dừng; cửa sổ dùng quân mẫu và không gửi lệnh vào ván.

Runtime thử đã trả health `configured`, HTML/scene chunk HTTP 200, client
`index-DhwSZ4p5.js`, scene `LudoScene-CWd1RZ5W.js`, CSS `game-QAva43k5.css`.
Cả ba asset đang phục vụ khớp từng byte với build mới. Preview public PID 77592,
tunnel PID 105572 và trial 5180 PID 51528 giữ nguyên danh tính/thời điểm chạy.
Candidate riêng tại `.roomtune/releases/bau-cua-20261118T045308/`; chưa chuyển
candidate vào `dist`. Cả 35 client artifacts của build qua secret scan heuristic.

Nghiệm thu hosted Bầu Cua/cấp coin trên candidate đã đạt, gồm cập nhật ví và
hiển thị cược giữa hai trình duyệt; danh tính/phòng tạm đã được dọn.
Migration thông báo ví `202611180001` từ lượt chuẩn bị trước đã áp dụng thành
công; lần backup mới trước đó thất bại, không coi archive đó là bản backup
hợp lệ. Không thực hiện thêm migration hoặc restore trong đợt sửa giao diện.

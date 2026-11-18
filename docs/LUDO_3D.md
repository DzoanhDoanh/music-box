# Bàn cờ 3D, K/O, Long quyền, Rider Kick và Kamehameha — 18/11/2026

Đã commit, push và public bản K/O cùng các thay đổi Bầu Cua/cấp coin/nhảy đá
theo yêu cầu người dùng. Phạm vi và bằng chứng phát hành được ghi trong
[bản phát hành 18/11](RELEASE_2026-11-18.md).

Đợt cập nhật hiệu ứng gồm Long quyền, Rider Kick và Kamehameha, cùng lựa chọn
hiển thị lưu trên thiết bị. Chi tiết candidate và kiểm chứng trong
[bản phát hành hiệu ứng](RELEASE_EFFECTS_2026-11-18.md).

## Kamehameha — Goku tụ khí và bắn chưởng

- Thêm **Kamehameha** vào danh mục. Quân tấn công tạm biến thành Goku tóc
  đen dựng, võ phục cam, áo/thắt lưng/giày xanh. Hai tay chụm bên hông tụ
  quả cầu năng lượng rồi cùng đẩy về phía đối thủ. Chùm chưởng có lõi trắng,
  vỏ xanh, vòng năng lượng và hạt sáng; va chạm phát xung kích **KAMEHAMEHA — K/O**.
- Bắt đầu bắn ở 1400 ms, chưởng chạm đích ở 1800 ms. Đối thủ chỉ bay về nhà
  sau va chạm, giữ thời lượng 900 ms; người tấn công thu chưởng, tiến về ô đã
  được máy chủ xác nhận và phục hồi mẫu quân trong 950 ms sau va chạm.
- Renderer dùng chung giữa ván và xem thử; hiệu ứng chỉ dùng sự kiện bắt quân
  đã xác nhận. Không sửa luật, kết quả, mẫu quân đã lưu hoặc gửi thêm lệnh game.
  Lượt tiếp theo vẫn thao tác được. Không tải model ngoài hoặc thêm âm thanh.
- Mô hình khớp tay và hiệu ứng dựng cục bộ bằng Three.js; hạt sáng dùng
  instancing 32 hạt ở chế độ Rõ nét, 12 ở chế độ Nhẹ. Reduced motion/tab ẩn
  dừng biến hình và phục hồi quân; không diễn lại sự kiện đã tiêu thụ.
- **Bàn 3D → Thử hiệu ứng → Kamehameha → Xem thử / Dùng Kamehameha**.
  Lựa chọn lưu theo tài khoản/thiết bị và áp dụng cho hiệu ứng được xem trên
  thiết bị đó, không phải trang bị cá nhân đồng bộ sang máy thành viên khác.

Kiểm chứng: 4 ca browser desktop/mobile đạt cho tụ khí, chưởng, va chạm, phục
hồi mẫu quân mèo, dừng/phát lại, lưu lựa chọn qua reload, bắt quân trong fixture,
snapshot trùng và ngắt bằng reduced motion. Xem thử giữ nguyên ván và nhạc.
12 unit test đạt (3 Kamehameha, 4 Rider, 3 quỹ đạo nền, 2 đồng hồ); TypeScript và lint
phạm vi thay đổi đạt. Đã xem ảnh desktop/mobile cho tụ khí, bắn chưởng và
bắt quân trên bàn. Chưa đo FPS trên điện thoại vật lý.

Đồng hồ trình diễn dùng cùng bước thời gian cho quân thường, quân bị bắt,
K/O, Long quyền, Rider và Goku. Bỏ thời gian chờ trước khung hình đầu trên
bàn render theo nhu cầu; các khung sau tính đủ thời gian thực, không cắt
mỗi delta về 50 ms khiến đòn đánh kéo dài trên máy render chậm. Kiểm thử
đồng hồ bao gồm FPS thấp, một khung dài, bàn đứng yên lâu và sự kiện đã dừng.

Lượt browser cuối sau sửa đồng hồ: **20/20 ca desktop/mobile đạt** cho cả
K/O, Long quyền, Rider Kick và Kamehameha, gồm reduced motion và WebGL fallback.
Build riêng `scripts/build-bau-cua.mjs` đạt; 35 client artifacts qua scan heuristic.
Trước phát hành, Kamehameha được nghiệm thu tại **http://127.0.0.1:5181**, candidate
`.roomtune/releases/bau-cua-20261118T072846/candidate`. Health `configured`,
HTML và 34 asset mới khớp từng byte; 4 đường dẫn nội bộ không trả bí mật cấu hình.
Client `index-D-jcEe8a.js`, scene `LudoScene-D6Rv2RJ0.js`, CSS `game-B76KUyGC.css`.
Trong đợt nghiệm thu riêng, public/5180 giữ nguyên HTML, hồ sơ tiến trình và
con trỏ deploy; tunnel vẫn chạy. Bản thử dùng cùng Supabase; browser test chỉ
dùng fixtures. Trạng thái phát hành được ghi trong biên bản hiệu ứng ở trên.

## Rider Kick — biến hình khi đá quân

- Thêm **Rider Kick** vào danh mục hiện có. Quân tấn công tạm biến thành
  Kamen Rider dạng mô hình 3D cổ điển: mũ xanh, mắt đỏ, ăng-ten, giáp bạc,
  khăn đỏ và thắt lưng phát sáng. Mô hình có khớp tay/chân: một chân duỗi
  tung cú đá, chân kia gập; khăn và năng lượng ở chân chuyển động theo đòn.
- Chuỗi biểu diễn: biến hình/tích lực → bật lên → lao qua vòng năng lượng
  → va chạm/xung kích/K/O → trở lại mẫu quân đã chọn. Hỗ trợ cả mẫu động vật
  và các mẫu quân khác; chỉ quân tấn công đổi hình, đối thủ giữ mẫu riêng.
- Timeline trình diễn dùng mốc va chạm 1700 ms, đối thủ bắt đầu bay về nhà
  đúng mốc này và giữ thời lượng bay hiện có. Rider trở về mẫu gốc trong
  500 ms sau va chạm. Chỉ đổi quỹ đạo/thời gian hình ảnh của sự kiện đá quân
  đã xác nhận; không ghi `skin`, đổi luật/kết quả hoặc trì hoãn lượt tiếp theo.
- Dừng xem thử, đóng cửa sổ, thay sự kiện hay bật giảm chuyển động đều trả
  quân về mẫu đã chọn. Sự kiện bị ngắt được tiêu thụ và không diễn lại khi
  bật chuyển động. Không tải model ngoài, thêm dependency hoặc âm thanh tự phát.
- **Bàn 3D → Thử hiệu ứng → Rider Kick → Xem thử / Dùng Rider Kick**.
  Lựa chọn dùng chung cơ chế lưu theo tài khoản/thiết bị với Long quyền.
  Bàn phẳng và mẫu quân lưu trên máy chủ vẫn giữ nguyên.

Kiểm chứng Rider Kick: 4 ca browser desktop/mobile đạt cho xem thử, hoàn tất,
phát lại/dừng, lưu lựa chọn qua reload, biến hình từ quân mèo, phục hồi mẫu quân,
snapshot trùng và ngắt bằng reduced motion. Dữ liệu game/skin và nhạc không bị
thay bởi việc xem thử. 7 unit test quỹ đạo (4 mới, 3 hồi quy), TypeScript và lint
phạm vi thay đổi đạt. Đã kiểm tra ảnh desktop/mobile: Rider bay, va chạm và
quân trở lại hình dạng ban đầu. Chưa đo FPS trên điện thoại vật lý.
12 ca browser hồi quy K/O/Long quyền/danh mục/reduced motion/WebGL cũng đạt;
tổng đợt Rider là 16 ca browser. Các bài kiểm tra dùng phòng fixture.

Lần triển khai Rider Kick và Long quyền trước Kamehameha dùng cổng 5181.
Ở thời điểm đó, hai hiệu ứng chưa commit, push hoặc public. Build riêng đạt,
candidate `.roomtune/releases/bau-cua-20261118T070706/candidate` đã được nạp
vào 5181. Health `configured`, HTML và 34 asset mới khớp từng byte; 4 đường
dẫn nội bộ được kiểm tra không trả nội dung bí mật cấu hình. Client
`index-CNVUdUK_.js`, scene `LudoScene-CUOIhdVC.js`, CSS `game-yMgxRKgr.css`.
Public/5180 giữ nguyên HTML, hồ sơ tiến trình và con trỏ deploy; các tiến
trình được kiểm tra đúng danh tính, public và tunnel vẫn chạy.

## Long quyền — phát triển riêng sau bản K/O

- Thêm **Long quyền** vào danh mục hiệu ứng: rồng ngọc có sừng vàng, râu,
  bờm và thân uốn theo đường đi của quân tấn công; chạm đích phát xung kích,
  hất đối thủ về nhà và hiện **LONG QUYỀN — K/O**. Dùng quỹ đạo nước đi đã
  được máy chủ xác nhận, không đổi luật hoặc gửi thêm lệnh game.
- Rồng dựng từ geometry cục bộ; thân/gai dùng instancing với 36 đoạn ở chế độ
  Rõ nét, 18 đoạn ở chế độ Nhẹ. Rồng thu nhỏ trong 650 ms sau va chạm; xung kích
  dùng chung renderer K/O và kết thúc sau 1.45 giây theo đồng hồ hoạt ảnh.
  Không tải model ngoài hoặc thêm dependency. Tôn trọng reduced motion,
  trạng thái ẩn trang/bàn và lỗi WebGL như hiệu ứng hiện có.
- **Bàn 3D → Thử hiệu ứng → Long quyền → Xem thử / Dùng Long quyền**.
  Có thể phát lại, dừng hoặc đổi về K/O. Mở danh mục không tự phát hiệu ứng.
  Cửa sổ xem thử dùng quân mẫu và không thao tác ván/nhạc thật; nút áp dụng
  được giữ dễ thấy trên màn hình nhỏ.
- Lựa chọn là **tùy chọn hiển thị của người xem trên thiết bị này**, lưu theo
  tài khoản trong localStorage. Áp dụng cho các đòn đá quân hiển thị tại đây,
  không phải trang bị cá nhân được đồng bộ cho những người khác. Nếu trình
  duyệt không lưu được, vẫn áp dụng trong phiên hiện tại và báo rõ bằng toast.
  Mặc định vẫn là K/O; phẳng vẫn là chế độ bàn mặc định.
- Renderer được chốt theo từng sự kiện đã nhận. Đổi lựa chọn chỉ ảnh hưởng
  lần đá tiếp theo, không thay thế/phát lại đòn đang diễn hoặc đòn đã kết thúc.
  Không cần migration database.

Bản thử Long quyền trước khi bổ sung Rider Kick đã chạy trên cổng 5181;
các định danh build và candidate bên dưới ghi nhận lần cài đặt trước đó.

Kiểm chứng Long quyền:

- 12 ca browser desktop/mobile đạt qua hai lượt kiểm tra cuối: 8 ca hồi quy
  K/O/danh mục/reduced motion/WebGL, 4 ca Long quyền xem thử/áp dụng và
  reload/đá quân/hoàn tất/không diễn lại khi đổi lựa chọn. Có kiểm tra nhạc và
  dữ liệu ván giữ nguyên khi xem thử, focus bàn phím, axe và màn 320×568.
- Bài chụp ảnh dùng đồng hồ điều khiển; bài gameplay/reload dùng đồng hồ thật
  để kiểm tra hiệu ứng kết thúc bình thường qua lần tải trang.
- 3 unit test quỹ đạo đạt; TypeScript, lint phạm vi thay đổi đạt. Đã xem ảnh
  rồng bay, va chạm và bàn chơi trên desktop/mobile. Browser dùng fixtures;
  chưa đo FPS trên điện thoại vật lý.
- Build riêng `scripts/build-bau-cua.mjs` đạt; scan heuristic 35 client artifacts
  đạt. Candidate `.roomtune/releases/bau-cua-20261118T064052/candidate` chỉ được
  nạp vào 5181. Health `configured`, HTML và 34 asset mới khớp từng byte;
  4 đường dẫn nội bộ được kiểm tra không trả nội dung bí mật cấu hình.
  Client `index-BmGMM8ih.js`, scene `LudoScene-CBw6xfKE.js`, CSS `game-CqUe4OBM.css`.
  Public/5180 giữ nguyên HTML, hồ sơ tiến trình và con trỏ deploy; build cũng
  xác nhận toàn bộ `dist` và `.roomtune/game-build` giữ nguyên. Tunnel vẫn chạy.

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

## Sử dụng

Public: https://roomtune.dzoanh.me. Vào phòng → Trò chơi → Cờ cá ngựa → mở bàn →
**Bàn 3D**. Bản thử riêng `http://127.0.0.1:5181` vẫn chạy trên máy dự án và dùng
chung Supabase với public; đổi port không cô lập dữ liệu. Nên dùng bàn riêng khi
thử gameplay. Chuyển chế độ hiển thị không làm thay đổi dữ liệu ván.
Để xem hiệu ứng mà không đi quân thật, chọn **Thử hiệu ứng → Xem thử K/O**.
Có thể phát lại hoặc dừng; cửa sổ dùng quân mẫu và không gửi lệnh vào ván.

Tại thời điểm phát hành K/O, runtime public và thử đã trả health `configured`, HTML/scene chunk HTTP 200, client
`index-DhwSZ4p5.js`, scene `LudoScene-CWd1RZ5W.js`, CSS `game-QAva43k5.css`.
Cả ba asset đang phục vụ khớp từng byte với build mới. Chỉ runtime public được
khởi động lại; tunnel và hai bản thử giữ nguyên. Candidate đã chuyển vào `dist`;
bản trước giữ tại `.roomtune/releases/bau-cua-20261118T045308/previous`.
35 client artifacts mới qua secret scan heuristic. Kiểm tra HTTPS xác nhận cả
254 assets công khai, gồm các chunk cũ được giữ lại, khớp bản phát hành.

Nghiệm thu hosted Bầu Cua/cấp coin trên candidate đã đạt, gồm cập nhật ví và
hiển thị cược giữa hai trình duyệt; danh tính/phòng tạm đã được dọn.
Migration thông báo ví `202611180001` từ lượt chuẩn bị trước đã áp dụng thành
công; lần backup mới trước đó thất bại, không coi archive đó là bản backup
hợp lệ. Không thực hiện thêm migration hoặc restore trong đợt sửa giao diện.

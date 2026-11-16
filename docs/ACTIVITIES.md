# Giọng nói, vòng quay và menu phòng

Bản thử ngày 16/11/2026: `http://127.0.0.1:5180`. Chưa phát hành bộ tính năng này lên public.

## Sử dụng

- **Tìm & thêm bài → micro**: nhấn rồi nói tên bài bằng tiếng Việt. Khi nhận được câu hoàn chỉnh,
  micro dừng và văn bản đi qua cùng debounce 650 ms như khi gõ. Có nút dừng, giới hạn 20 giây,
  tự dừng khi rời/ẩn trang. Bị từ chối quyền, lỗi mạng hoặc không hỗ trợ thì vẫn gõ bình thường.
- **Giải trí → Vòng quay may mắn** trên desktop; **Thêm → Vòng quay may mắn** trên mobile.
  **Thành viên** chọn từ người online, tính mỗi tài khoản một lần dù có nhiều tab.
  Mọi thành viên online đều được quay. Cần ít nhất hai lựa chọn đủ điều kiện.
- **Tự nhập**: mỗi dòng một món ăn, địa điểm, công việc hoặc lựa chọn bất kỳ; 2–50 mục khác nhau,
  mỗi mục tối đa 60 ký tự. Chế độ này không thay đổi nhạc hoặc trao thưởng. Danh sách nháp được
  giữ theo phòng/tài khoản trong sessionStorage khi đổi mục hoặc tải lại cùng tab.
- **Có phần thưởng nhạc** là tùy chọn của chế độ thành viên. Danh mục hiện có: ưu tiên một bài
  hoặc tối đa hai bài đang chờ mới nhất của người trúng. Chỉ người online có bài đã được duyệt
  và đang QUEUED được đưa vào lượt quay có thưởng. Một người có một bài vẫn đủ điều kiện nhận
  thưởng “tối đa hai bài”. Các phần thưởng khác chỉ thêm sau khi có tính năng thực hiện tương ứng.
- Thưởng áp dụng trực tiếp, **bỏ qua biểu quyết theo yêu cầu của người dùng**. Không cắt bài
  đang phát, không đổi chế độ playlist và không xóa các bài phía trước. Hàng chờ có nhãn
  **Ưu tiên từ vòng quay**. Sắp xếp thủ công/biểu quyết được thông qua sau đó có thể thay thứ tự này.
- Mỗi phòng một lượt / 10 giây. Máy chủ lưu kết quả trước animation 5 giây; mọi người nhận cùng
  kết quả. Lịch sử hiện 10 lượt gần nhất. Mất phản hồi thì **Xác nhận lại lượt quay** gửi đúng mã
  yêu cầu cũ, kể cả sau reload; không coi một lỗi mạng là lượt quay mới.

Menu còn hai mục nghe/tìm chính; các mục khác nằm trong **Cá nhân**, **Giải trí**, **Quản lý**.
Trên mobile dùng **Thêm**. Quyền quản trị vẫn được kiểm tra phía máy chủ. Chuyển sang vòng quay
giữ nguyên player đã bật; màn hình vòng quay ưu tiên nội dung hoạt động, khung video nhỏ nằm cạnh
trên desktop và phía dưới trên mobile. Vòng quay không phát âm thanh riêng.

## Cài đặt và dữ liệu

- Migration `202611160001_lucky_wheel.sql` đã áp dụng trên project `zhcnyadfkpszgdmesxvi`
  sau backup ngày 16/11/2026. Không sửa migration đã áp dụng. Cột `queue_entries.priority`
  mặc định 0, nên phòng chưa nhận thưởng giữ thứ tự hiện có.
- `VITE_ENABLE_WHEEL=true` bật giao diện ở thời điểm build; `ENABLE_WHEEL=true` bật API.
  Cả hai mặc định tắt trong mẫu cấu hình. `build:game` / `game:start` bật riêng bản thử.
  Public `.env`, `.dev.vars`, `dist` và tiến trình tunnel không được thay thế trong lần triển khai này.
- Route là `/room/:id?tool=wheel`, dùng đường dẫn phòng đã có trong tunnel.
- RPC `wheel_snapshot` và `wheel_spin` chỉ service role được gọi. Actor lấy từ Auth, quyền thành
  viên/ban luôn kiểm tra trước receipt. Danh sách thành viên lấy từ lease Presence đã xác thực,
  không nhận winner, seed, actor hoặc danh sách user tùy ý từ trình duyệt.
- Khóa giao dịch cùng phòng, receipt bền vững, đối chiếu `previous_id`, cooldown và rejection
  sampling từ số ngẫu nhiên mật mã đảm bảo một kết quả cho một lượt. Thưởng chỉ sửa priority
  của bài QUEUED; các biểu quyết OPEN cũ trở thành STALE. Next tôn trọng priority ở cả bốn chế độ.
- Kết quả nằm trong `private.wheel_spins`, không đọc trực tiếp bằng anonymous/authenticated.
  Giữ tối đa 100 lượt và dọn lượt trên 30 ngày khi có lượt quay mới; xóa phòng cascade lịch sử.
  Đây không phải lịch xóa hằng ngày: phòng không quay tiếp có thể giữ lịch sử lâu hơn. Receipt
  theo retention 7 ngày hiện có của hệ thống. Danh sách tự nhập đã quay là dữ liệu chung của phòng.
- Voice dùng Web Speech API của trình duyệt; hỗ trợ tùy browser. Có thể cần kết nối dịch vụ nhận
  dạng ngoài máy. ROOMTUNE không tải lên hoặc lưu file âm thanh; chỉ dùng transcript để tìm bài.
  `Permissions-Policy` cho microphone ở same origin, vẫn tắt camera/geolocation. Cần HTTPS hoặc
  loopback. Đã kiểm thử bằng mô phỏng sự kiện; chưa xác nhận nhận dạng micro vật lý.

Tham khảo kỹ thuật: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition),
[Web Speech API](https://webaudio.github.io/web-speech-api/).

## Kiểm thử

- `npm.cmd test`: unit/API/React, gồm voice lifecycle, validation, quyền wheel và thứ tự ưu tiên.
- `npm.cmd run test:db`: PostgreSQL riêng; kiểm tra receipt/concurrent spins, four-mode priority,
  active run, toàn bộ ID/status/position queue, consent, Presence, quyền và cascade.
- `npm.cmd run test:e2e:activities`: browser riêng cổng 5176, desktop/mobile, voice fixtures,
  custom draft, replay sau reload, layout 320px, light/dark Axe và reduced motion.
- `npm.cmd run test:hosted:wheel -- --project-ref zhcnyadfkpszgdmesxvi`: mặc định nhắm bản thử 5180,
  tạo tài khoản/phòng riêng, dùng Auth/Presence/RPC thật, kiểm tra kết quả ở hai phiên và dọn dữ liệu.
  Sau phát hành, thêm `--base-url https://roomtune.dzoanh.me` để kiểm tra qua HTTPS public;
  script chỉ chấp nhận public origin đúng cấu hình.
  Không dùng phòng thật của người dùng để nhận thưởng hoặc kiểm tra Next.
- Chạy browser suites lần lượt. Dùng `build:game` sau `game:stop`; không dùng build thường khi
  public đang chạy. Scan client riêng bằng `node scripts/check-client-secrets.mjs .roomtune/game-build/client`.

Kiểm thử ưu tiên không chứng minh đã sửa báo cáo kéo bài làm mất các bài phía trước; lỗi kéo đó
chưa được tái hiện/xác định nguyên nhân riêng trong phạm vi này.

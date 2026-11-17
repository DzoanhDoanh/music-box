# Quản lý phòng nhạc và bàn cờ

Trạng thái: đã public lúc **14:06 ngày 17/11/2026 (giờ Việt Nam)**. Migration hosted,
public và trial 5180 đã cập nhật. Xem [phát hành](MANAGEMENT_SAFE_STARTS_RELEASE.md)
và [kiểm thử API với dịch vụ thật](MANAGEMENT_PUBLIC_CHECK.md).

## Vị trí và quyền

- Phòng nhạc: nhấn số thành viên trên thanh đầu → **Quản lý / mời thành viên ra**.
  **Mời khỏi phòng** thu hồi tư cách thành viên; **Chặn** ngăn vào lại bằng mã phòng.
  Quyền điều hành hiện có được giữ: moderator chỉ quản lý member, không kick chủ phòng,
  moderator khác hoặc chính mình. Chủ phòng quản lý mọi thành viên khác.
- **Cài đặt phòng → Xóa phòng**: chỉ chủ phòng được xóa. Yêu cầu nhập đúng tên phòng;
  xóa toàn bộ dữ liệu thuộc phòng, gồm bàn cờ, lịch sử chơi, hàng chờ và chat. Thư viện cá nhân
  và các phòng khác vẫn được giữ.
- Bàn cờ: nút hình người/dấu trừ cạnh người chơi để **Mời khỏi bàn**. Quản trò hiện tại hoặc
  chủ phòng nhạc được dùng; không kick chính mình hoặc chủ phòng nhạc.
  Người bị kick mất ghế ở bàn chờ, hoặc bị tính đầu hàng giữa ván. Họ vẫn là thành viên phòng
  nhạc và được xem bàn. Đây là kick ghế, không phải cấm truy cập: khi bàn chờ có thể tự ngồi lại.
- **Tùy chọn bàn → Xóa bàn**: quản trò hiện tại hoặc chủ phòng nhạc, yêu cầu nhập đúng tên bàn.
  Xóa vĩnh viễn bàn và lịch sử của bàn; không chạm vào playback, hàng chờ hoặc bàn khác.

## Tính nhất quán

- Kick đang tới lượt: xóa xúc xắc cũ, chuyển lượt hợp lệ. Bàn tạm dừng vẫn tạm dừng.
  Kick quản trò: chuyển quyền cho người còn lại. Chỉ còn một người thì kết thúc và lưu thứ hạng.
- Người bị kick không tự được đưa lại vào bàn qua rematch. Chỉ JOIN mới rõ ràng mới xóa dấu
  đã mời rời ghế. Replay JOIN cũ không xóa dấu này. V1/v2 giữ nguyên luật và tiến độ hiện có.
- SQL khóa phòng/bàn cùng thứ tự với các command hiện tại, xác minh quyền độc lập với UI,
  giữ CAS/version và receipt. API không cho truyền actor từ browser.
- Xóa có receipt riêng tồn tại sau khi tài nguyên bị xóa. Browser lưu yêu cầu trong
  sessionStorage trước khi gửi và gửi lại cùng key nếu mất phản hồi. Replay CREATE của bàn
  đã xóa bị từ chối; không vô tình tạo lại bàn. Các helper cũ chuyển vào private và bị thu hồi
  quyền gọi trực tiếp, bao gồm service_role.
- Broadcast chỉ thông báo đổi phiên bản. Browser xác minh qua API, không tin thông báo để
  cấp quyền. Khi lỡ broadcast: poll bàn tối đa khoảng 5 giây, phòng 15–30 giây khi đang online;
  reconnect/focus kiểm tra lại. API luôn chặn ngay từ lúc giao dịch xóa/kick hoàn tất.
- Snapshot bị từ chối do mất quyền sẽ dừng hiển thị player cũ và chuyển về danh sách phù hợp;
  lỗi mạng/refresh phiên tạm thời vẫn giữ cơ chế phục hồi nghe nhạc hiện tại.

## Kiểm thử và phát hành

Ngày 17/11/2026: 75 kiểm tra PostgreSQL cô lập đã qua; 8 kiểm thử quản lý desktop/mobile và
13 kiểm thử hồi quy game đã qua (1 kịch bản đa browser chỉ chạy desktop, được skip trên mobile).
Unit/API, lint, typecheck và build ứng viên đều qua. Đã quét 26 file client để phát hiện dấu
khóa server; kiểm tra hash xác nhận `dist` public và con trỏ deploy không bị thay đổi.
Đây chưa phải xác minh trên Supabase hosted hay public.

Sau sửa luật ô an toàn: toàn bộ unit/API (381), PostgreSQL (80) và browser (32 đạt,
2 bỏ qua có chủ đích) đã được xác minh lại. Xem [kết quả mới nhất](GAME_RULES_AUDIT.md).

- `tests/unit/game-moderation.test.ts`: cả v1/v2, ghế chờ, kick lượt đang đi, tạm dừng,
  chuyển quản trò, kết thúc ván và các hành động không hợp lệ.
- `tests/unit/cangua-engine.test.ts`: hồi quy luật v2 cũ (`safe: NONE`), exact capture,
  cấm vượt quân cản và không đi qua cửa của mình để lặp vòng.
- `tests/unit/cangua-safe-starts.test.ts`: luật mới bảo vệ ô xuất quân, mỗi ô một ngựa cùng màu;
  màu khác chỉ được đi qua, không dừng dù trống. Xem [luật hiện tại](GAME_RULES_V2.md).
- `tests/unit/delete-resource.test.tsx`: nhập tên, phục hồi receipt qua unmount/mất phản hồi,
  từ chối quyền, dữ liệu local hỏng; không coi endpoint thiếu hoặc tính năng bị tắt là đã xóa.
- `tests/integration/game-api.test.ts`: xác thực identity, feature flag, schema, idempotency key.
- `scripts/test-management-db.mjs`: quyền SQL, retry, replay cũ, loại ghế khỏi rematch,
  xóa dây chuyền và không tác động dữ liệu nhạc/thư viện ngoài phạm vi.
- `tests/game-e2e/management.spec.ts`: nhiều browser độc lập, desktop/mobile, xác nhận tên,
  thu hồi quyền, feedback và chuyển về danh sách. Chỉ dùng fixture; không xóa phòng thật.

Migration `202611170002_owner_management.sql` đã áp dụng sau kiểm thử/backup;
không sửa migration đã áp dụng. Build đã phát hành ở `.roomtune/management-build`; tuyệt đối chỉ
serve thư mục `client`, không serve worker build hoặc file cấu hình bí mật.

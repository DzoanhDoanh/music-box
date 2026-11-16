# Xem trạng thái thành viên

Trạng thái ngày 16/11/2026: đã phát hành tại https://roomtune.dzoanh.me lúc 19:19
giờ Việt Nam. Bản thử riêng tại http://127.0.0.1:5180 vẫn hoạt động.
Xem [kiểm tra public](MEMBERS_PUBLIC_CHECK.md).

## Cách dùng

Vào phòng, bấm nút **N online** có biểu tượng thành viên ở thanh đầu trên desktop/mobile.
Khi chưa đồng bộ được kết nối, nút hiển thị **Thành viên** và vẫn mở danh sách tên.

- Người online đứng trước, có chấm xanh và nhãn **Online**; người còn lại có nhãn **Offline**.
- Hiện vai trò **Chủ phòng / Điều hành / Thành viên**, đánh dấu tài khoản của bạn bằng **Bạn**.
- Tìm tên có dấu hoặc không dấu; lọc **Tất cả / Online / Offline**.
- Danh sách dài cuộn bên trong hộp thoại; dùng Tab để chọn danh sách rồi phím mũi tên,
  Home/End để cuộn. Escape hoặc nút đóng trả focus về nút mở.
- Danh sách cập nhật trong lúc đang mở. Mở/đóng không điều hướng hoặc tạo lại máy phát.

## Trạng thái và giới hạn

Online là đang mở phòng hiện tại, kể cả trang trò chơi của phòng. Không phải bằng chứng
người đó đang phát nhạc, nghe được âm thanh hay đang nhìn màn hình. Chỉ mở chat của một
phòng khác không phát Presence nghe của phòng đó.

Dùng cùng tài khoản trên nhiều tab/thiết bị chỉ tính một thành viên. Thành viên sẽ offline
khi không còn phiên mở phòng; đóng đột ngột hoặc mất mạng có thể mất thêm thời gian để
Realtime phát hiện. Không hiển thị “lần cuối online” vì chưa lưu lịch sử hoạt động.

Chưa có Presence snapshot, đang kết nối lại hoặc thiết bị của người xem mất mạng: danh
sách hiển thị **Đang cập nhật**, tạm khóa lọc online/offline, không báo sai tất cả offline.
Khi đồng bộ lại, bộ lọc đang chọn hoạt động trở lại. Chuyển phòng/tài khoản không dùng trạng
thái từ phòng hay tài khoản trước. Người mất membership không còn xem được danh sách.

## Triển khai

Tận dụng private Realtime hiện có và `snapshot.members`; không thêm polling, endpoint,
migration hoặc thay đổi cấu hình Supabase. Chỉ lấy ID có membership trong snapshot,
gộp các phiên của cùng ID; tên và vai trò lấy từ snapshot, không lấy từ Presence payload.
Presence chỉ là thông tin giao diện, không cấp quyền quản trị hay quyết định biểu quyết.
Quyền biểu quyết vẫn do authenticated server leases và electorate đã lưu quyết định.

`RealtimeService` chia sẻ transport giữa phòng và chat, chỉ thông báo danh sách sau sync;
xóa snapshot Presence khi reconnect, bỏ callback cũ sau unmount/đổi danh tính. `useRoom`
tách trạng thái theo phòng/tài khoản; `RoomMembers` hiển thị hộp thoại và lọc tại client.

## Chạy thử

```powershell
npm.cmd run game:stop
npm.cmd run build:game
npm.cmd run game:start
npm.cmd run test:hosted:members -- --project-ref zhcnyadfkpszgdmesxvi
```

Các lệnh `game:*` dùng lại workflow build/thử toàn ứng dụng ở cổng 5180. Build giữ nguyên
hash public `dist` và deployment pointer. Script hosted tạo/dọn đúng tài khoản và phòng
tạm, kiểm tra private Realtime thật trên hai browser contexts. Xem
[kết quả hosted](MEMBERS_HOSTED_CHECK.md). Sau khi phát hành, có thể kiểm tra lại
bằng `--base-url https://roomtune.dzoanh.me`; script chỉ chấp nhận đúng HTTPS APP_BASE_URL.

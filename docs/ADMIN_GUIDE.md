# Dành cho chủ phòng

**Nhận lại host sau khi máy cũ tắt:** với **Tất cả thiết bị**, thông báo chờ ngay tại khung nghe
có nút **Nhận quyền host trên máy này** cho chủ phòng/moderator. Bấm một lần để nhận quyền và
tiếp tục bài cũ từ checkpoint gần nhất; nếu autoplay bị chặn, bấm **Tiếp tục phát nhạc**. Máy
host cũ phải hết lease (tối đa khoảng 30 giây từ heartbeat cuối) hoặc đã nhả quyền. Tải lại trang
không tự nhận quyền; cần nhận lại một lần. **Kiểm tra lại host** tải trạng thái mới từ máy chủ.
Giữ trang/máy host hoạt động; có thể cấp moderator cho một người tin cậy qua **Quản lý thành viên**
để người đó tiếp quản khi cần. Thành viên thường không được nhận host, kể cả khi cả phòng thiếu host.

**Sắp xếp playlist:** khi dùng chế độ MANUAL và tắt biểu quyết, chủ phòng/moderator có nút
**Kéo** (sáu chấm) ở đầu mỗi bài. Giữ nút bằng chuột/ngón tay rồi kéo đến vị trí muốn đổi;
vạch màu đánh dấu nơi thả. Vẫn có nút lên/xuống. Bàn phím: Enter chọn bài, mũi tên/Home/End
chọn vị trí, Enter xác nhận, Escape hủy. Khi bật biểu quyết, dùng **Đề xuất vị trí** và chờ
đủ phiếu; nút Kéo không cho bỏ qua quy tắc này.

**Chat phòng:** tất cả thành viên hiện tại có thể gửi/đọc văn bản. Chủ phòng và moderator có nút xóa
tin của bất kỳ thành viên nào; thao tác được lưu audit theo ID tin, không chép nội dung vào nhật ký.
Kick/ban chặn API chat ngay; kết nối Realtime cũ chỉ nhận tín hiệu đồng bộ rỗng và không thể đọc
nội dung mới nếu đã mất quyền. Không cần bật thêm cài đặt cho chat.

Chat nổi có danh sách các phòng đã tham gia; mở chat ở phòng khác không làm người đó online để
biểu quyết tại phòng ấy. Biểu quyết mới tự hiện thành thẻ nổi cho các thành viên đang ở phòng nhạc,
kể cả khi họ đang tìm bài, xem thư viện hoặc cài đặt. Thu nhỏ thẻ không có nghĩa là bỏ phiếu.

Tin hiển thị tối đa 30 ngày và 100 tin gần nhất. Việc gửi/xóa dọn tin quá hạn trong phòng; cron
`maintenance_cleanup` dọn toàn bộ khi được cấu hình. Với preview qua tunnel chưa có cron định kỳ,
tin của phòng không hoạt động có thể còn trong database đến lần dọn tiếp theo, nhưng API đọc/xuất
đã loại tin quá 30 ngày. Xóa tài khoản xóa toàn bộ tin của tài khoản đó.

Operator tạo email/password trong Supabase Auth, sau đó thêm UUID đó vào system_admins. Không có đăng ký quản trị công khai. Đăng nhập `/login`, mở `/rooms`, tạo phòng mới.

Trong phòng, **Cài đặt phòng** điều chỉnh giới hạn, PIN, khóa phòng, mode queue, voting, approval, auto advance. PIN để trống khi chọn thay đổi PIN sẽ bỏ PIN. Chủ phòng giữ quyền grant/revoke moderator. **Quản lý thành viên** kick/ban/unban và xem audit. Kick cho phép vào lại, ban chặn identity hiện tại; anonymous users có thể tạo identity khác nên cần PIN/CAPTCHA/rate limits.

Máy nối loa: mở **Máy phát nhạc**, chọn **Nhận quyền phát nhạc**. Bấm phát hoặc tiếp tục khi trình duyệt chặn autoplay. Player YouTube luôn nhìn thấy. Không đóng/sleep máy host. Chỉ một controller active; host cũ hết lease sau 30 giây, thiết bị khác mới nhận quyền. Quảng cáo/buffering không tự làm skip bài.

Sắp xếp trực tiếp ở MANUAL: kéo bài hoặc dùng nút lên/xuống khi tính năng biểu quyết tắt. Clear queue giữ nguyên bài đang phát. Bài chờ duyệt có nút duyệt/từ chối. Thành viên không được play/pause/next hoặc thay đổi cài đặt.

Để cả nhóm duyệt việc đổi thứ tự, mở **Cài đặt phòng → Hàng chờ & bình chọn → Biểu quyết khi đổi vị trí bài**, bật rồi **Lưu cài đặt**. Phòng giữ chế độ MANUAL, mọi người (kể cả owner/moderator) dùng **Đề xuất vị trí** và chờ phiếu. Điều kiện: quá nửa số người online lúc tạo, ít nhất 2 phiếu đồng ý; người đề xuất tính một phiếu. Không ai tự thông qua khi ở một mình. Tắt tùy chọn để owner/moderator kéo/thay vị trí trực tiếp trở lại; thao tác tắt hủy đề xuất đang mở.

Mỗi phòng có một đề xuất mở tối đa 2 phút. Người đề xuất và owner/moderator có thể hủy; người khác có thể đổi phiếu khi đề xuất chưa kết thúc. Thay hàng chờ hoặc thu hồi quyền thành viên làm đề xuất mất hiệu lực. Nhịp xác nhận online có thể trễ tối đa khoảng 60 giây khi thiết bị mất mạng đột ngột; số phiếu của đề xuất đã mở không bị hạ theo người rời mạng.

Hàng chờ hiển thị cạnh player nhỏ trên desktop rộng, xếp dọc trên mobile. Khi chuyển sang tìm bài/cài đặt trong cùng phòng, player vẫn gắn trên trang và nhìn thấy. **Dừng máy phát** nhả quyền để thiết bị khác tiếp quản; không cần đợi hết lease nếu nhả quyền thành công. Heartbeat lưu vị trí phát khoảng mỗi 10 giây; refresh/reconnect có thể quay lại checkpoint gần nhất và vẫn chịu autoplay policy.

Host hỗ trợ Space để phát/tạm dừng và Shift + mũi tên phải để Next, khi không nhập form hoặc đang trong dialog. Trong Thư viện có xuất dữ liệu cá nhân dạng JSON. Xuất chỉ dữ liệu của identity đang đăng nhập.

Chủ phòng có thể đổi mã phòng trong Cài đặt với xác nhận; liên kết/QR cũ hết hiệu lực cho lần tham gia mới, thành viên hiện tại giữ session. Nhật ký quản trị phân trang 50 sự kiện.

# Thiết kế ROOMTUNE

Graphite/violet, accent nhẹ, typography Segoe UI/system có tiếng Việt. Hình vinyl CSS là minh họa thương hiệu, không phải dữ liệu bài hát. Không tải ảnh stock hay nội dung bài hát giả ở production.

Token màu nằm trong styles.css, light theme thay toàn bộ token; spacing 4/8/12/16/24/32/40. Desktop sidebar, mobile tab có cuộn trong vùng điều hướng. Player min-height 200px, không ẩn hoặc che YouTube. Component UI theo mô hình shadcn (Radix Slot/Dialog, cva, cn); icons Lucide, toast Sonner.

Form semantic labels, focus-visible, skip link, dialog focus management, loading/error/empty/offline; reduced motion. Reorder có kéo thả và nút lên/xuống cho keyboard. Không dùng alert/confirm trình duyệt.

Chat nổi: nút tròn 56px, khung mục tiêu 360px, danh sách phòng và vùng tin nhắn cuộn riêng.
Khung chat mục tiêu cao 540px kể cả launcher, tự thu theo phần màn hình còn trống. Bong bóng
của mình căn phải màu accent/ink, tin của thành viên căn trái; tên/giờ nhỏ gọn. Ô nhập cao
44–96px theo nội dung, nút gửi icon 44px, bộ đếm và hướng dẫn bàn phím dưới ô nhập. Nút xóa
nằm ngoài bong bóng, hiện khi hover/focus trên desktop và luôn hiện trên màn hình cảm ứng.

Playlist MANUAL có nút **Kéo** 44×48px với tay nắm sáu chấm; chỉ nút này bắt cử chỉ kéo,
phần còn lại của hàng vẫn cuộn bình thường. Viền màu đánh dấu đích, không đổi dữ liệu trước ACK.
Enter chọn/lưu, mũi tên/Home/End chọn vị trí, Escape hủy; vẫn giữ nút lên/xuống.
Khi bật biểu quyết, dùng Đề xuất vị trí thay thao tác kéo trực tiếp.

Biểu quyết nổi: thẻ tối đa 360px ở góc trên bên phải, hai nút bỏ phiếu ≥44px, số phiếu và thời hạn,
thu nhỏ thành nút nhắc. Đề xuất đến không tự cuộn trang/chiếm focus. Các khung tự tránh IFrame thực tế
và visualViewport; khi chật, chat thu về launcher và người dùng có thể thu nhỏ biểu quyết/cuộn trang.

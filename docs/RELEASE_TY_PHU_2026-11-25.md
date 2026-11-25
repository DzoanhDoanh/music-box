# Tỷ Phú Phố Nhạc — phát hành 25/11/2026

Game cờ tỷ phú thứ tư của ROOMTUNE. Trong phòng, chọn **Trò chơi → Tỷ Phú Phố Nhạc →
Mở bàn**. Luật đầy đủ ở [thiết kế](TY_PHU_GAME_DESIGN.md).

## Phạm vi

- Bàn 32 ô đi từ Hà Giang vào TP. Hồ Chí Minh:
  - 19 thành phố trong 7 nhóm liền kề;
  - 5 bãi biển, 3 ô Cơ hội, Thuế nhà;
  - 4 góc: Xuất phát, Nhà tù, Đại nhạc hội, Sân bay.
- Xây theo vòng: Cấp 2 → Cấp 3 → Khách sạn. Khách sạn chỉ xây được khi ô đã ở Cấp 3,
  miễn nhiễm phiếu và không bị mua lại.
- Mua lại ×1,5 giá hiện tại, bán ngân hàng ×0,5, monopoly ×1,5, Đại nhạc hội ×2.
- 15 phiếu Cơ hội, mỗi phiếu một cơ chế. Thứ tự bộ phiếu giữ kín ở server.
- Thắng ngay khi có 3 monopoly, một dãy nhà hoặc 4 bãi biển. Ngoài ra thắng khi là người
  trụ lại cuối cùng, hoặc giàu nhất khi hết giờ.
- Hết giờ lượt thì hệ thống tự đánh thay. Vắng 3 lượt liên tiếp thì máy chơi thay.
  Người rời phòng bị loại khỏi ván.

## Kiểm chứng

- Engine: 27 unit test; mô phỏng 1.000 ván, mọi ván kết thúc và tổng tiền luôn khớp.
- PostgreSQL thật (`npm run test:db:ty-phu`): 9 nhóm. Gồm:
  - giữ kín bộ phiếu, RLS;
  - phiên bản cũ, sai lượt, gửi trùng;
  - lệnh đồng thời, lượt hết giờ, người rời phòng;
  - 3 ván chơi trọn qua database, giới hạn tạo bàn.
- HTTP: route ẩn khi tắt cờ, không bao giờ trả bộ phiếu, chặn lệnh sai.
- Trình duyệt (`npm run test:e2e:ty-phu`): 8 ca desktop/mobile, gồm quét axe. Không
  hồi quy phòng nhạc (94 ca) và 535 unit/API test.

## Phát hành

- Migration `202611250001_ty_phu.sql` đã áp lên dự án Supabase đã link.
- Bật `ENABLE_TY_PHU` và `VITE_ENABLE_TY_PHU`, build lại, khởi động lại preview và
  tunnel. Ingress có thêm đường dẫn `/room/:id/games/ty-phu`.
- Kiểm tra qua https://roomtune.dzoanh.me:
  - health `configured`, `tyPhuEnabled: true`;
  - trang game trả 200;
  - API Tỷ Phú trả 401 khi chưa đăng nhập (route đã mở);
  - chunk giao diện tải được.
- Chưa tạo ván thử trên dữ liệu thật. Lần chơi đầu trong phòng là lần kiểm tra hosted
  đầu tiên.

## Đã biết

- Đã bổ sung cùng ngày: thiếu tiền trong lượt của mình thì người chơi tự chọn ô bán (giai
  đoạn Trả nợ). Nợ phát sinh ngoài lượt (Sinh nhật) vẫn tự bán ô rẻ nhất.
- Bổ sung 26/11/2026: chơi với máy, nút Chơi lại, nhãn Sắp thắng. Cần áp migration
  `202611260001_ty_phu_bots.sql` trước khi bật trên bản public.
- Chưa có đổi/bán đất giữa người chơi và bàn 3D (bước 5 trong thiết kế).

# Phát hành quản lý phòng/bàn và ô xuất quân an toàn

Public lúc **14:06 ngày 17/11/2026 (giờ Việt Nam)** tại [ROOMTUNE](https://roomtune.dzoanh.me).
Commit chạy trên public: [57ca3cf](https://github.com/DzoanhDoanh/music-box/commit/57ca3cf2cde289613b2f9969cf2624e4e12d8194),
đã push fast-forward lên `master` và `codex/voice-lucky-wheel`.

## Thay đổi

- Bàn mới dùng ô xuất quân an toàn: mỗi ô một ngựa cùng màu; màu khác chỉ đi qua,
  không dừng dù trống. Ra 6 không được xuất chồng. Ô thường giữ luật chặn/đá đúng số.
- Bàn v1/v2 cũ giữ luật đã lưu, kể cả rematch. Muốn đổi bàn v2 cũ: lúc chờ, quản trò vào
  **Tùy chọn bàn → Tùy chỉnh luật → Ô xuất quân → An toàn**; hoặc tạo bàn mới.
- Mặc định góc nhìn phẳng; vẫn nhớ lựa chọn góc nhìn nổi khi người dùng chủ động bật.
  Vòng hiệu ứng trang trí không còn chặn chuột/chạm vào quân bên cạnh.
- Xóa phòng nhạc, xóa bàn cờ và kick người/ghế có kiểm tra quyền và xác nhận.
  Xóa cần nhập đúng tên; mất phản hồi có thể thử lại cùng yêu cầu mà không xóa nhầm.
  Xem [vị trí nút và phạm vi quyền](OWNER_MANAGEMENT.md).

## Dữ liệu và runtime

- Backup trước migration: `backups/before-management-safe-starts-2026-11-17T07-04-36-905Z.dump`,
  702.979 bytes; archive gồm public/private/auth/migrations và được `pg_restore --list` kiểm tra.
- Chỉ áp dụng `202611170002_owner_management.sql` và `202611170003_safe_start_squares.sql`
  vào project `zhcnyadfkpszgdmesxvi`. Dry-run sau phát hành không còn migration chờ.
  Không viết lại ván cũ hoặc reset dữ liệu hosted.
- Build đã kiểm thử `.roomtune/management-build` được đưa sang `dist`, giữ assets cũ cho
  tab đang mở. Main `index-C0w48bKw.js`, game `GameHub-Cwp1cuNv.js`, CSS `GameHub-BTf1lEvn.css`.
  Chỉ `client` được phục vụ làm assets; cấu hình/server source không được public.
- Preview 4173 được restart riêng, tunnel giữ nguyên. Trial 5180 đã chuyển cùng build;
  cấu hình và deployment pointer giữ nguyên. Bản cũ lưu tại
  `.roomtune/releases/management-20261117-140621/previous`, bản trial cũ ở
  `previous-game-trial-build` trong cùng thư mục. Không rollback về runtime không hiểu
  `safe: STARTS` sau khi đã có bàn theo luật mới; cần sửa tiếp bằng runtime tương thích.

## Xác minh

- 381 unit/API tests, 80 kiểm tra PostgreSQL cô lập và 32 kịch bản browser đạt
  (2 bỏ qua có chủ đích). Lint, typecheck, build và scan client đều đạt.
- HTTPS trả đúng HTML; toàn bộ 160 client artifacts khớp file phát hành. Health hoạt động;
  API thiếu đăng nhập trả 401, Origin ngoài allowlist trả 403, cấu hình/source/debug trả 404.
- [9 nhóm kiểm tra game hosted](GAME_PUBLIC_CHECK.md) đạt: desktop/mobile đăng nhập,
  tạo/vào bàn, tung/đi thật, Realtime, retry, mất mạng/reload và thu hồi quyền.
- [5 nhóm kiểm tra quản lý hosted](MANAGEMENT_PUBLIC_CHECK.md) đạt: lưu luật safe-start,
  quyền xóa/kick, kick giữa ván, rematch loại ghế đã kick, xóa/retry, chặn CREATE cũ làm
  hồi sinh bàn, xóa phòng kéo theo bàn và bảo toàn trạng thái nghe nhạc.
- Đã mở ảnh chụp desktop/mobile từ public để kiểm tra bàn phẳng và các ô an toàn.
  Chỉ dùng phòng/tài khoản riêng của lượt thử; toàn bộ dữ liệu thử đã dọn đúng ID.

Public vẫn chạy trên máy Windows qua Cloudflare Tunnel; chưa deploy Worker production.
Browser hosted không phải hai thiết bị vật lý và không xác nhận âm thanh YouTube.

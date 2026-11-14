# Vận hành, backup và recovery

Theo dõi `/api/v1/system/health` (cấu hình), Wrangler structured logs (requestId/code/path/status). Không log JWT/PIN/secret. Health chưa probe DB; smoke authenticated cần thực hiện riêng. Phân biệt server reachable, host lease, player ready và PLAYING; không suy ra âm thanh thực tế chỉ từ trạng thái server.

## Backup

Cài PostgreSQL client tương thích server. Đặt PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD/PGSSLMODE=require trong environment/session bảo mật. Chạy `pwsh scripts/backup.ps1`; pg_dump custom toàn DB (quyền cho phép), không credentials trong args. Không đưa dump lên Git. Mã hóa và lưu ở kho do operator kiểm soát. Gợi ý giữ 7 bản ngày, 4 bản tuần; xóa rotation chỉ sau xác nhận archive mới và quyền operator.

Không có scheduler hoặc managed backup tự động nào được cấu hình trong phiên này. Cần lưu riêng Auth configuration, secrets, Realtime settings; dump DB không thay thế cấu hình dịch vụ bên ngoài.

## Restore an toàn

Tạo database/staging riêng, không production. Xác minh backup có thể đọc `pg_restore --list`. Set environment tới database đích thử nghiệm rồi `pg_restore --no-owner --exit-on-error --dbname=<DATABASE_THỬ> <ARCHIVE>`. Không dùng --clean trên production. Kiểm tra row counts, FK, RLS, functions, owner grants, login, snapshot, queue/next, audit và private channel.

Đã chạy pg_dump/pg_restore thật từ cluster PostgreSQL 17 kiểm thử sang database riêng `roomtune_restore_check`, đối chiếu số bản ghi, room_snapshot function và RLS. Chưa thực hiện restore Supabase hosted/Auth/service configuration. Test dùng PostgreSQL client 18 trên Windows; đặt PG_BIN để dùng thư mục binary khác, Linux cần pg_dump/pg_restore >=17 trong PATH.

## Migrations/rollback

Backup trước schema change. Migration additive, kiểm thử trên bản sao, deploy backend tương thích schema cũ và mới. Lỗi ứng dụng: rollback Worker version qua Cloudflare; không rollback DB bằng xóa schema. Sửa schema bằng migration tiến tiếp có bảo toàn dữ liệu. Giữ ít nhất một version frontend/backend tương thích trong rollout.

## Retention cần hoàn thiện trước public rollout

Worker có lịch 03:00 UTC hằng ngày trong wrangler.jsonc: dọn cache hết hạn, rate buckets quá 2 ngày, receipts quá 7 ngày; xóa metadata hiển thị cũ trên 29 ngày và refresh tối đa 20 video cũ nhất qua API chính thức. Batch giới hạn để giữ số subrequests dưới ngưỡng Free; CPU thực cần đo sau deploy. Không xóa queue/history/favorites. Metadata hết hạn hiển thị thông báo cần cập nhật; enqueue vẫn phải kiểm chứng lại video.

Lịch này **chưa được deploy**, nên chưa hoạt động tự động. Phải giám sát lỗi scheduled invocation và độ trễ metadata; với nhiều video cần tăng batch trong giới hạn quota. Audit/history không tự prune; retention cần chính sách của tổ chức. Idempotency receipt được giữ 7 ngày, không retry mutation sau cửa sổ đó.

# Kiểm thử thêm link YouTube với dịch vụ thật

UTC: 2026-11-16T11:47:08.347Z
URL: http://127.0.0.1:5180
Kết quả: PASS

- Real search for bad returns 12 results after removing application search caps
- Real YouTube metadata and Supabase enqueue accept BAD (-q_S27LbNKU, 225s)
- Link addition succeeds without calling search or consuming the shared search budget
- Exact run-owned room and identity cleaned
- Public artifacts and deployment pointer preserved

Auth, YouTube metadata và enqueue Supabase thật trong phòng tạm. Gọi tìm kiếm bad một lần trên trial đã bỏ trần tìm kiếm riêng. Không sửa/reset bộ đếm chung, sửa phòng người dùng hoặc đổi cấu hình hosted. Không kiểm chứng IFrame/âm thanh trong lượt này. Bản sửa chỉ có trên trial, chưa public.

# Kiểm thử quản lý phòng/bàn public

UTC: 2026-11-17T07:10:55.862Z
URL: https://roomtune.dzoanh.me

Kết quả: PASS

- Hosted safe-start table persists; members cannot kick owner or delete table/room; exact name enforced
- Active kick and receipt replay work; removed player retains music/viewing, stays excluded from rematch
- Table deletion retries safely, delayed CREATE cannot resurrect it, music state remains unchanged
- Owner room deletion and retry succeed; room-owned table is deleted by cascade
- Exact run-owned rooms and identities cleaned; no user room was modified

Kiểm thử API HTTPS với Supabase Auth/PostgreSQL thật. Chỉ tạo và dọn dữ liệu của lượt thử; giao diện xóa/kick được kiểm tra bằng browser fixture desktop/mobile.

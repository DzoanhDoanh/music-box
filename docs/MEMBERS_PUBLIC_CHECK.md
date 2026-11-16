# Kiểm thử trạng thái thành viên với dịch vụ thật

UTC: 2026-11-16T12:20:01.528Z
URL: https://roomtune.dzoanh.me

Kết quả: PASS

- Real membership protects the roster; temporary room has three known members
- Real private Realtime identifies online and offline members on desktop/mobile
- Multiple tabs count once; leaving one retains presence, closing the last removes it
- Returning to the room updates open rosters automatically; offline filtering uses current members
- Local network loss shows unknown rather than false offline; reconnect restores live status
- Revoked membership closes the roster and removes that user despite any stale Presence
- Exact run-owned rooms and identities cleaned
- Public build and deployment pointer remain unchanged

Auth, Supabase, private Realtime và API thật. Chỉ tạo/dọn phòng và tài khoản tạm theo ID của lượt chạy. Không dùng phòng người dùng, không đổi schema hoặc cấu hình hosted. Hai context Chromium mô phỏng desktop/mobile; không kiểm chứng âm thanh trong lượt này.
Kiểm tra qua domain HTTPS public thật.

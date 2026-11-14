# Kiểm tra kết nối hosted

Thời điểm UTC: 2026-11-13T17:31:18.441Z
URL kiểm tra: http://127.0.0.1:5173

Kết quả: PASS — 12 bước đạt.

- PASS: Public channels rejected by hosted Realtime private-only setting
- PASS: Hosted email/password and anonymous Auth
- PASS: Create room, PIN join and authenticated snapshot through Hono Worker
- PASS: Non-member API/RLS denial and service-only RPC protection
- PASS: Private Realtime subscription, Presence and outsider rejection
- PASS: Real YouTube metadata, enqueue, vote and committed version Broadcast
- PASS: Live YouTube search through authenticated backend
- PASS: Device listening settings, owner permissions, heartbeat Broadcast and host seek
- PASS: Host claim/release and member playback permission denial
- PASS: Two real YouTube IFrames advance, follow host pause/resume, and cleanly leave
- PASS: Membership revocation blocks API and private channel reconnect
- PASS: Run-owned test rooms/accounts cleaned up

Worker được gọi qua địa chỉ local; Auth, PostgreSQL, Realtime WebSocket và YouTube API dùng dịch vụ thật. Tài khoản/phòng kiểm thử thuộc lượt chạy được dọn; cache metadata/tìm kiếm thật và bộ đếm quota vẫn được giữ đúng chính sách.

IFrame thật được thử bằng hai browser contexts headless, âm thanh hệ thống tắt trong kiểm thử. Chưa xác nhận âm thanh trên hai thiết bị vật lý, quảng cáo, CAPTCHA, 30 trình duyệt đồng thời hoặc Cloudflare deployment. Không chứa key hoặc token.

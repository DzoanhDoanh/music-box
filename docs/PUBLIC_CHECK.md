# Kiểm tra kết nối hosted

Thời điểm UTC: 2026-11-16T01:17:24.387Z
URL kiểm tra: https://roomtune.dzoanh.me

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
- PASS: Two real YouTube IFrames advance through hosted Auth renewal, follow pause/resume, and cleanly leave
- PASS: Membership revocation blocks API and private channel reconnect
- PASS: Run-owned test rooms/accounts cleaned up

API được gọi qua HTTPS public đã cấu hình; Auth, PostgreSQL, Realtime WebSocket và YouTube API dùng dịch vụ thật. Tài khoản/phòng kiểm thử thuộc lượt chạy được dọn; cache metadata/tìm kiếm thật và bộ đếm quota vẫn được giữ đúng chính sách.

IFrame thật được thử bằng các browser contexts headless độc lập, âm thanh hệ thống tắt trong kiểm thử. Ép mốc expires_at của phiên kiểm thử để SDK gia hạn qua Auth thật; không thay TTL/cấu hình hosted hoặc chờ JWT hết hạn tự nhiên. Cả host và listener giữ cùng identity/IFrame, thời gian tăng và không có pause event trong cửa sổ gia hạn. Chưa xác nhận âm thanh trên hai thiết bị vật lý, quảng cáo, CAPTCHA, 30 trình duyệt đồng thời hoặc Cloudflare deployment. Không chứa key hoặc token.

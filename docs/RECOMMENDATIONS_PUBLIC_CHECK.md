# Kiểm thử gợi ý nhạc public qua HTTPS

UTC: 2026-11-16T03:37:38.189Z
URL: https://roomtune.dzoanh.me

Kết quả: PASS

- Real hosted authentication and membership deny anonymous requests and outsiders
- New room receives 61 eligible discoveries from real YouTube/cache (1184 ms)
- Available discoveries by source: {"VN":24,"US":11,"KR":4,"JP":25}
- Real database joins return owned history; completed songs are familiar and failed songs are excluded
- Built application displays real recommendation cards on desktop/mobile without horizontal overflow
- Desktop/mobile show 12 initial discoveries, expand to 24, filter sources and reset locally without another API request
- Mobile enqueues a recommended song once; desktop receives queue update; next feed excludes queued song
- Revoked membership immediately blocks recommendation API
- Exact run-owned rooms and identities cleaned; shared public YouTube metadata cache retained
- Public build and deployment pointer remain unchanged

Auth, Supabase, YouTube/cache và API thật, không chặn hoặc giả HTTP. Lịch sử PLAYED/FAILED được gieo có chủ đích trong phòng tạm để kiểm tra xếp hạng; không phải bằng chứng đã nghe hết các bài đó. Browser desktop/mobile là hai context Chromium, không phải hai thiết bị vật lý. Không xác minh âm thanh ở lượt này.
Các yêu cầu và browser đi qua HTTPS/domain public thật.

Chỉ tạo/dọn ID của lượt kiểm thử; không thay đổi phòng thật của người dùng. Metadata công khai của YouTube và cache chung được giữ theo cơ chế bình thường của ứng dụng.

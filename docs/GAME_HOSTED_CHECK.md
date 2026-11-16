# Kiểm thử bản game riêng với Supabase thật

UTC: 2026-11-14T11:08:43.679Z
URL: http://127.0.0.1:5180

Kết quả: PASS

- Real password login and anonymous member PIN join through desktop/mobile UI
- Desktop creates table; mobile joins; both real private game channels connect
- Hosted game API/RLS deny outsider, direct writes, service RPC and forged client Broadcast
- Real server dice and legal UI move; duplicate receipt preserves the exact outcome; committed Broadcast received
- Offline mobile reconnect/reload restores saved board with hosted Auth and private channel
- Music queue/playback/version unchanged; public music build has no game navigation and game API returns 404
- Revoked membership blocks game API and private channel reconnect
- Exact run-owned records cleaned; public dist and deployment pointer unchanged

Hai browser contexts desktop/mobile dùng Auth, PostgreSQL, Realtime thật; không giả API hoặc dice. Không phải hai thiết bị vật lý. Không xác minh cron production hoặc âm thanh YouTube. Chỉ tạo và dọn tài khoản/phòng riêng của lượt chạy.

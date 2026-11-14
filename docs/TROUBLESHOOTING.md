# Xử lý sự cố

| Triệu chứng               | Kiểm tra                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Dịch vụ chưa cấu hình     | `.env` cho browser và `.dev.vars`/Worker secrets; restart Vite sau thay đổi                  |
| Không vào được phòng      | code, PIN, locked/capacity, ban, Anonymous Auth enable                                       |
| Không tạo phòng           | admin email/password và bản ghi system_admins, không user_metadata                           |
| Không realtime            | private=true, RLS realtime.messages, Allow public access off, JWT session, WebSocket network |
| HOST_BUSY                 | host cũ vẫn heartbeat; đóng host cũ, đợi lease hết                                           |
| STALE_HOST / STALE_RUN    | lấy snapshot mới, nhận quyền host lại; không gửi Next cũ                                     |
| YouTube không phát        | referrer/origin, player >=200px, quyền embed/region/age, thao tác người dùng, mạng           |
| YouTube quota             | xem Google Cloud Console; giảm search; thử link nếu videos.list vẫn còn quota                |
| Queue đầy                 | limits mỗi người/toàn phòng; duyệt hoặc xóa bài không cần                                    |
| pnpm chặn build script    | allowBuilds chỉ esbuild/workerd/embedded-postgres đã kiểm tra; `pnpm install` lại            |
| test:db không chạy        | port 55439 trống, binary đúng platform, quyền chạy subprocess/temp                           |
| Supabase local không chạy | bật Docker engine trước `supabase start`                                                     |

Không reset/xóa database production để sửa sự cố. Lưu requestId và code lỗi, không gửi token/secret vào log hoặc issue.

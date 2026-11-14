# API v1

Chat: `GET /api/v1/rooms/:id/chat?since=0` trả `{messages,latest_sequence,read_sequence,unread_count}`.
`since` là số nguyên không âm ≤ Number.MAX_SAFE_INTEGER; 100 tin gần nhất trong 30 ngày, sắp theo sequence.
Message: `{id,sequence,sender_id,sender,body,created_at,deleted}`. Cursor chỉ phục vụ unread, không phải phân trang.

`POST /api/v1/rooms/:id/chat` yêu cầu UUID `Idempotency-Key` và JSON strict:
`{action:"send",body:"..."}` hoặc `{action:"remove",message_id:"uuid"}`. Body trim, 1–1.000 ký tự,
không chứa NUL; không nhận sender/client timestamps. Actor luôn lấy từ JWT. Kết quả `{id,sequence}`.
Mọi thành viên hiện tại được gửi/đọc, chỉ tác giả/owner/moderator được xóa. Chat có receipt bền vững,
được retry tự động với cùng key và có thể retry thủ công cùng nội dung sau lỗi mạng; đổi payload với
key cũ trả IDEMPOTENCY_CONFLICT. 20 tin mới/phút/actor/phòng, cộng giới hạn Auth chung.

`GET /api/v1/export` thêm `chat_messages`: chỉ tin chưa xóa do actor gửi trong 30 ngày (đọc phân trang,
nếu vượt giới hạn xuất 50.000 bản ghi sẽ trả lỗi thay vì trả một bản xuất thiếu dữ liệu).

Tất cả endpoint trừ health yêu cầu `Authorization: Bearer <Supabase access token>`. JSON. Mutations tạo phòng, room commands, library yêu cầu UUID `Idempotency-Key`. Lỗi `{error:{code,message,requestId}}`; message an toàn tiếng Việt. Origin chỉ chấp nhận cùng origin hoặc APP_BASE_URL. Max body 32 KiB.

| Method   | Endpoint                               | Mục đích                                                                |
| -------- | -------------------------------------- | ----------------------------------------------------------------------- |
| GET      | /api/v1/system/health                  | Trạng thái cấu hình, không phải kiểm tra DB live                        |
| GET/POST | /api/v1/rooms                          | Phòng đã tham gia / tạo phòng bởi admin đã cấp                          |
| POST     | /api/v1/rooms/join                     | code/name/pin; tạo membership                                           |
| GET      | /api/v1/rooms/:id/snapshot             | Phòng, settings, queue, members, playback, role, version                |
| POST     | /api/v1/rooms/:id/commands             | Command union Zod trong shared/contracts.ts                             |
| GET      | /api/v1/rooms/:id/history?page=0       | 25 bản ghi/trang                                                        |
| GET      | /api/v1/rooms/:id/admin                | Audit, bans; manager only                                               |
| GET      | /api/v1/youtube/search?room=UUID&q=... | Tìm YouTube phía server, giới hạn quota                                 |
| GET/POST | /api/v1/library                        | Hồ sơ, favorites, playlist; owner scoped                                |
| GET      | /api/v1/export                         | Xuất hồ sơ, thư viện và yêu cầu của chính user; 2 lần/giờ               |
| POST     | /api/v1/account/delete                 | confirmation=DELETE; xóa identity hiện tại, chặn tài khoản sở hữu phòng |

Commands: enqueue(video_id), remove/approve/reject(entry_id), vote(entry_id,enabled), reorder(ids,version), clear, settings, kick/ban/unban/moderator/demote(user_id), claim(controller_id), heartbeat/release(controller_id,fence), next/ended/failed/play/pause/report(controller_id,fence,run_id).

Biểu quyết đổi vị trí (14/11/2026): setting `reorder_approval: boolean` (mặc định false) chỉ owner đổi được, yêu cầu `queue_mode: MANUAL` khi bật. Thêm ba command strict, cùng UUID Idempotency-Key:

- `reorder.propose`: `entry_id: uuid`, `position: integer 1..500`, `queue_ids: uuid[]` là toàn bộ thứ tự QUEUED hiện tại. Không nhận electorate hoặc ngưỡng từ client. Giới hạn 6 đề xuất/phút theo actor/phòng.
- `reorder.vote`: `proposal_id: uuid`, `approved: boolean`. Chỉ người thuộc electorate chốt lúc mở và còn lease online được bỏ phiếu; đổi phiếu khi OPEN.
- `reorder.cancel`: `proposal_id: uuid`. Người đề xuất hoặc owner/moderator được hủy.

`POST /api/v1/rooms/:id/presence` nhận strict `{ session_id: uuid, sequence: positive safe integer, online: boolean }`. Auth xác minh actor; lease 60 giây, heartbeat 20 giây. Sequence tăng, request cũ không ghi đè request mới; không dựa vào receipt để gửi lại. Cùng user ở nhiều session chỉ tính một người.

Snapshot có `reorder: { online_count, proposal }`, proposal null hoặc gồm ID/bài/người đề xuất/vị trí cũ-mới, electorate_count, required_votes, yes_votes/no_votes, my_vote, eligible, expires_at và status. Status: OPEN/APPLIED/REJECTED/CANCELLED/EXPIRED/STALE. Quorum `max(2, floor(n/2)+1)`, TTL 2 phút. Client không nhận danh sách electorate/voters riêng. Direct reorder bị chặn ngay cả với owner/moderator khi bật consent. Poll snapshot mỗi 3 giây lúc OPEN là dự phòng cho committed version broadcast.

Lệnh host yêu cầu role owner/moderator; settings và grant moderator yêu cầu owner. Guest chỉ xóa bài của mình nếu được cấu hình. Payload không nhận vote_count hoặc arbitrary SQL. Enqueue kiểm tra metadata YouTube trước khi vào RPC.

rotate_code chỉ owner, trả kết quả qua snapshot cập nhật. `/admin?page=0` có 50 audit events/trang. Heartbeat nhận thêm run_id/position để lưu checkpoint, chỉ cập nhật vị trí nếu run ID khớp; release không cần position. Client dùng lại Idempotency-Key khi retry lỗi mạng tạm thời; không retry join/delete/quota/permission tự động.

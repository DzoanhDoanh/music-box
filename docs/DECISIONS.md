# Quyết định kiến trúc

Khôi phục host (14/11/2026): ALL_DEVICES tiếp tục dùng một controller có lease/fence hợp lệ;
listener dừng khi host hết lease, không biến Play local thành lệnh điều khiển phòng. Thông báo
hiện cả trước khi bật nghe, có kiểm tra lại và đường nhận host rõ cho owner/moderator. Chỉ nút
chủ động của người dùng mới yêu cầu claim; yêu cầu được tiêu thụ một lần, gắn room + actor và
không được dùng lại khi đổi tài khoản/phòng. Chặn claim đồng thời, ACK sai controller/fence hoặc
đến sau watchdog, bỏ ACK sau unmount. Giữ run/entry/checkpoint, quyền SQL và lease 30 giây;
không tự chuyển host, không cấp quyền cho member, không thay migration.

Tối ưu độ trễ (14/11/2026): vẫn gọi Auth getUser cho mỗi request. Hai bucket rate limit user/write
độc lập được chờ song song sau khi xác minh identity; chờ cả hai kết thúc và không chạy nghiệp vụ
nếu một bucket từ chối. Chat mutation và queue mutation không-enqueue bỏ truy vấn membership HTTP
lặp, dựa trên kiểm tra membership/ban bên trong RPC transaction trước receipt replay. Enqueue giữ
precheck trước YouTube quota. Không cache token/quyền, không thay migration. `Server-Timing` chỉ
chứa thời lượng auth/limits/data/total, không có ID/token/path; thời lượng từng nhóm là tổng các
lượt fetch nên có thể lớn hơn wall time khi các lượt chạy song song.

Chat chỉ thêm bubble tạm sau receipt ACK, ghép theo ID/sequence và bỏ bản tạm khi snapshot mới
đã bao phủ sequence đó; không báo gửi thành công trước ACK. Composer mở lại ngay sau ACK và
refetch chạy nền, giữ receipt khi thử lại. Quyền lỗi thật vẫn ẩn toàn bộ cache/bubble; mỗi actor/phòng
có instance riêng. Kéo playlist vẫn gửi trọn danh sách ID/version, kiểm tra quyền và stale version
ở server; không thay position trước xác nhận.

Chat nổi (14/11/2026, thay thiết kế trong luồng nội dung): widget toàn ứng dụng ở góc dưới bên phải,
chọn các phòng đã tham gia mà không điều hướng, đổi playlist hoặc tháo player. Dùng private room channel
với `chat.updated` riêng và query cache theo actor/phòng;
fallback polling 15 giây khi mở/30 giây khi đóng, refetch khi reconnect. Chọn văn bản thuần, 1.000 ký tự,
100 tin hiển thị và 30 ngày retention; không thêm upload/typing/read receipts của người khác. Đây là
mặc định triển khai, không phải yêu cầu riêng của người dùng. Quota 20 tin mới/phút để hạn chế spam.
Unread theo marker riêng cho identity/phòng trên thiết bị, không tính tin lịch sử lần đầu, không tự cuộn
khi đọc lịch sử; cập nhật marker giữa các tab qua storage event. Bản nháp và receipt của lần gửi lỗi chỉ
giữ trong memory toàn ứng dụng, riêng từng phòng; mất khi reload/đổi tài khoản/mất membership.
Chat ở phòng khác không track Presence, gọi lease online hoặc claim host. Transport chia sẻ theo topic;
chờ teardown kênh identity cũ trước khi tạo kênh mới, bỏ ACK track cũ sau reconnect.

Biểu quyết đang chờ tự nổi ở góc trên bên phải trên mọi mục của phòng đang nghe. Thành viên bỏ phiếu
ngay hoặc thu nhỏ thành nút nhắc; cập nhật cùng đề xuất giữ trạng thái thu nhỏ, đề xuất mới tự mở.
Không chuyển focus khi nhận đề xuất. Portal không làm dịch playlist; kết quả giữ đến khi đóng.
Thứ tự bố trí: tránh YouTube → biểu quyết → chat → toast; không đổi luật quorum hoặc SQL.

1. Modular monolith trên Cloudflare Workers + Static Assets. Không đổi stack sang Sites hosting.
2. PostgreSQL là nguồn dữ liệu; không lưu queue, rate limits hoặc host lease trong RAM Worker.
3. Mọi mutation queue serialize bằng row lock của room; idempotency key gắn actor/action/payload. Next phải so khớp run ID và fencing token.
4. Quyền admin lấy từ bảng quản trị được provision riêng, không lấy user_metadata.
5. Session SPA do Supabase SDK quản lý; CSP, không HTML tùy ý, refresh/expiry và logout rõ ràng. Realtime private dùng JWT của cùng session. Quyết định triển khai: backend dùng service-only RPC sau getUser, SQL nhận actor đã xác minh và kiểm tra quyền lần nữa; clients bị revoke EXECUTE.
6. Metadata chỉ nhập từ API chính thức, hết hạn cần làm mới; không download audio/video.
7. Player có kích thước tối thiểu 200x200, không bị che; dùng strict-origin-when-cross-origin, xử lý onAutoplayBlocked.
8. Không tự nhận đạt Lighthouse hoặc kiểm thử live khi chưa đo.
9. API retry có giới hạn và dùng lại idempotency key; không replay join/delete account. Service interfaces tách hosting khỏi nghiệp vụ; SQL giữ toàn bộ mutation atomic.
10. IFrame instance gắn một run ID, bỏ callback sau destroy/takeover; giữ player nhìn thấy khi đổi tab. Heartbeat lưu resume position có run guard và watchdog tính từ thời điểm gửi.
11. Tailwind chỉ scan src/client để reports/fixtures/docs không làm tăng CSS production. Public và room E2E có port/cache/output riêng.
12. Email provider phải bật để chủ phòng đăng nhập. auth.email.enable_signup=false của CLI đã gây email_provider_disabled trong kiểm thử hosted; người dùng đã cho phép bật lại. Tài khoản tự tạo không có quyền quản trị: chỉ operator thêm system_admins.
13. YouTubeService bind native fetch với globalThis để chạy đúng receiver trên Cloudflare Worker. Log lỗi chỉ ghi mã/reason và che key; lỗi API key không bị đánh đồng với hết quota.
14. Trên màn hình host, thông báo và nút theme nằm trong document flow để không che viewport YouTube. Sonner Toaster vẫn quản lý vòng đời thông báo; kiểm thử dùng Sonner thật.
15. Từ yêu cầu bổ sung ngày 14/11/2026, chủ phòng chọn `HOST_ONLY` hoặc `ALL_DEVICES`. Phòng cũ và phòng mới mặc định `HOST_ONLY`. Chỉ có một host điều khiển queue; follower phát YouTube IFrame chính thức trên thiết bị của mình sau khi bật nghe, không có API mutation từ sự kiện player của follower.
16. Với `ALL_DEVICES`, heartbeat host tăng room version để follower nhận vị trí và lease đã commit. Snapshot kèm thời gian server để hiệu chỉnh lệch đồng hồ; polling 15 giây phục hồi broadcast bị lỡ. Follower dừng khi host pause/buffering/mất lease; không cam kết đồng bộ từng mẫu âm thanh hoặc đồng bộ quảng cáo.
17. **Rời phòng** kết thúc phiên nghe/Presence trên thiết bị và quay về danh sách phòng; giữ tư cách thành viên, tài khoản và hàng chờ để có thể trở lại. Nếu thiết bị giữ host thì gửi release đúng controller/fence; lỗi mạng vẫn dừng âm thanh local và lease server tự hết hạn. Không đồng nghĩa xóa phòng hoặc đăng xuất.
18. Snapshot cài đặt từ SQL có metadata chỉ đọc (`room_id`, `updated_at`). Form loại các trường ngoài schema khi tạo payload và kiểm tra toàn bộ trường được chỉnh; schema command phía API vẫn strict. Fixture trình duyệt phải giữ metadata như dữ liệu thật để phát hiện lỗi tại bước lưu.
19. Vào lại phòng dựa trên phiên Supabase đã lưu và danh sách membership từ API, không dùng mã/PIN/token tự chế để cấp quyền. Chỉ lưu ID phòng vừa mở theo từng user trong localStorage để sắp xếp. Trang chủ, Join và Login có nút Vào lại phòng; link mời của phòng đã tham gia có thể vào thẳng. Phòng bị gỡ quyền không được khôi phục chỉ vì có ID đã lưu.
20. Chỉ luồng tham gia chủ động được tạo khách ẩn danh. API đọc hoặc request nền sau đăng xuất/hết phiên trả lỗi thay vì âm thầm tạo identity mới. Query danh sách phòng gắn với user ID; đăng nhập tài khoản xóa cache của phiên trước. Trong hồ sơ khách, thao tác đăng xuất được ghi rõ là Quên phiên trên thiết bị này, phân biệt với Rời phòng giữ phiên.

21. Bố cục nghe nhạc dùng một cây player ổn định và CSS responsive; desktop từ 1100px đặt player 320–380px cạnh hàng chờ. Không render hai IFrame theo breakpoint, không ẩn video để chỉ phát âm thanh.
22. Thay thế quyết định 14 về thông báo vào ngày 14/11/2026: toast chung luôn theo vùng màn hình nhìn thấy, chọn vị trí không giao với IFrame. Sonner giữ vòng đời/dismiss, chỉ hiện thông báo mới nhất; ở viewport quá nhỏ không còn vùng đọc được bên ngoài video, dùng document flow. Nút theme vẫn ở document flow khi có player.
23. `withFeedback` chỉ báo lệnh chủ động của người dùng, một ID cho loading/kết quả/lỗi; không báo thành công cho heartbeat/report tự động. Nút quản lý pending tại chỗ, chặn nhấn trùng khi chờ. Playlist dùng một thông báo chung và báo số bài thực sự gửi khi lỗi giữa chừng. API vẫn giữ retry/idempotency hiện có; không đổi logic host lease/run/fence.
24. Gia hạn phiên dùng Supabase SDK và cùng identity. API chỉ thử gia hạn một lần sau HTTP 401 `UNAUTHORIZED` rõ ràng (Auth middleware chạy trước business mutation), chia sẻ lần gia hạn giữa request đồng thời, đọc token mới trước từng lần gửi, giữ payload/receipt. Lỗi gia hạn tạm thời trả 503 để lần đồng bộ/heartbeat sau phục hồi, không gửi lại token vừa bị từ chối. Đăng xuất/đổi identity vô hiệu hóa cả kết quả request đang chạy; không tự tạo khách thay thế.
25. Snapshot phòng gắn với user ID; lỗi nền tạm thời giữ player và dữ liệu thành công gần nhất, thử đồng bộ sau 3s và khi token đổi/online/visibility. Bình thường poll mỗi 15s ở ALL_DEVICES, 30s ở HOST_ONLY. Mất phiên/quyền thật tháo player; đăng nhập lại có đường quay về phòng, tham gia khách điền sẵn mã nếu đã đọc được trước đó. Không coi dữ liệu cache là quyền truy cập.
26. Host có tối đa một heartbeat đang chờ. Lỗi tạm thời thử lại sau 2s nhưng tuyệt đối không kéo dài watchdog 25s từ request được server xác nhận gần nhất. Chỉ ACK đúng controller/fence đến trước deadline mới gia hạn. Mất quyền chắc chắn hoặc hết deadline dừng local; ACK đến muộn không tự nhận lại host. SDK tiếp tục tự cập nhật token cho private Realtime.
27. Khung phòng dùng chung cho chủ phòng và thành viên ở tất cả các mục: cột thông tin bài đang phát luôn hiện, kể cả thành viên trong chế độ chỉ host. Desktop từ 1100px giữ cột này cạnh nội dung; tìm kiếm/thư viện dùng toàn bộ chiều rộng cột nội dung, không còn trần 950px. Chỉ host/owner có điều khiển được phân quyền; chế độ HOST_ONLY không tạo IFrame trên máy thành viên. Mobile xếp dọc, player hiện có không bị thay instance khi đổi mục.

28. Theo lựa chọn cuối ngày 14/11/2026, lỗi video 2/5/100/101/150 tại host tự gọi `next` (ghi lịch sử SKIPPED), chuyển bài kể cả khi `auto_advance` cho kết thúc bình thường bị tắt. Chỉ báo đã chuyển sau ACK; lệnh thất bại giữ recovery. Lỗi thứ ba liên tiếp dừng chuyển tự động, giữ bài/hàng chờ còn lại. Reset chuỗi lỗi sau 5 giây phát có vị trí tăng ít nhất 4 giây hoặc người dùng chủ động thử lại/bỏ qua. Mã 153/lỗi không rõ/API loader/IFrame chưa ready là vấn đề trình phát hoặc kết nối, không tự kết luận hàng loạt video hỏng. Không phân loại quảng cáo hoặc buffering bằng timeout. Autoplay là luồng cử chỉ riêng.
29. Recovery chỉ dựng lại IFrame khi người dùng chọn; host chờ ACK LOADING và kiểm tra generation/run/fence/deadline trước khi dựng lại, giữ âm lượng/vị trí. Hủy timer/callback từ instance cũ. Listener chỉ phục hồi local, không có command queue. Liên kết YouTube cố định domain, encode video/title và có noopener/noreferrer; mở tab ngoài không trở thành máy phát đồng bộ của phòng. Không tự mở popup hoặc thay bản ghi bài bằng video khác.

30. Biểu quyết đổi vị trí là cài đặt riêng `reorder_approval`, mặc định false; khi true bắt buộc MANUAL và mọi vai trò đều phải đề xuất thay vì reorder trực tiếp. Owner có thể tắt khi cần sắp xếp trong phòng chỉ còn một người. Bình chọn thứ hạng cũ được ẩn khi bật biểu quyết, tránh nhầm hai cơ chế.
31. Theo lựa chọn người dùng, ngưỡng thông qua là quá nửa người online và tối thiểu 2 phiếu đồng ý; người đề xuất tính một phiếu. Electorate chốt khi tạo để tránh hạ ngưỡng do rời mạng; người đến muộn đợi đề xuất sau. Lease xác thực 60 giây/heartbeat 20 giây, một identity dù nhiều tab chỉ tính một thành viên. Pagehide gửi offline best-effort; mất mạng có thể mất tối đa khoảng thời gian lease để bị loại khỏi online của đề xuất mới.
32. Mỗi phòng một đề xuất mở 2 phút; thay đổi order, hết hạn, tắt cài đặt hay revoked/banned electorate thì không áp dụng. Phiếu có thể đổi trong lúc OPEN, kết thúc sớm khi không còn đủ số phiếu có thể đạt. Đề xuất approved đổi vị trí QUEUED trong transaction hiện có; không chạm bài PLAYING/PREPARING hoặc host lease. Kết quả cuối hiển thị cho cả phòng; snapshot polling 3 giây khi OPEN là dự phòng cho broadcast.

## Tài liệu đối chiếu ngày 13/11/2026

- https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- https://developers.cloudflare.com/workers/vite-plugin/
- https://hono.dev/docs/getting-started/cloudflare-workers-vite
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/realtime/authorization
- https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/terms/required-minimum-functionality
- https://developers.google.com/youtube/terms/developer-policies
- https://developers.google.com/youtube/data/determine_quota_cost

Quota phải đối chiếu Google Cloud Console thực tế; tài liệu hiện tại phân bổ riêng search.list, không mặc định quota vô hạn.

Đã đo Lighthouse 13.6.0 trên landing production local: Performance/Accessibility/Best Practices 100. Đây là kết quả riêng của lượt đo trong TESTING.md, không phải chứng nhận production hoặc mọi route. Tuân theo [YouTube IFrame reference](https://developers.google.com/youtube/iframe_api_reference) và [quy định embedded player](https://developers.google.com/youtube/terms/required-minimum-functionality).

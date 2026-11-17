# Kiểm thử Bầu Cua Party

Xác minh tại Windows/Node 24 ngày 17/11/2026. Dữ liệu thử là phòng/user tạm trong
PostgreSQL cục bộ; không gieo dữ liệu trong phòng người dùng thật.

`pnpm format:check` cũng đã đạt trên toàn repository.

| Lệnh                           | Kết quả                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `pnpm test`                    | 442/442, 42 file Vitest                                      |
| `pnpm test:db:bau`             | 25 nhóm PostgreSQL thật                                      |
| `pnpm test:db`                 | 113 kiểm tra, gồm 25 nhóm Bầu Cua và backup/restore          |
| `pnpm test:e2e:bau`            | 9/9 Chromium, PostgreSQL thật phía nghiệp vụ                 |
| `pnpm test:e2e:game`           | 67 đạt, 3 bỏ qua theo cấu hình có sẵn                        |
| `pnpm test:e2e:room`           | 94 đạt, 2 bỏ qua theo cấu hình có sẵn                        |
| `pnpm test:e2e:activities`     | 10/10 desktop/mobile                                         |
| `pnpm test:e2e`                | 12/12 trang công khai/luồng truy cập                         |
| `pnpm typecheck` / `pnpm lint` | Đạt                                                          |
| `pnpm build:bau`               | Build riêng đạt; 32 client artifacts qua quét marker secrets |

Tổng browser: 192 đạt, 5 bỏ qua. Các ca bỏ qua là biến thể mobile đã có kiểm tra
viewport trong ca desktop, không phải vì lỗi mới. Lần đầu bộ room timeout lúc
khởi động webServer; chạy lại có log khởi động đạt toàn bộ, không đổi nghiệp vụ
hay ngưỡng kiểm tra. CI đã thêm Bầu Cua nhưng chưa chạy trên GitHub.

## Phạm vi bằng chứng

- Unit: sáu mặt, payout, tràn số nguyên, toàn bộ 216 kết quả/liability, rejection
  sampling, commitment, phase, dealer eligibility, episode phá sản, selector bài.
- Summary: tổng lãi/lỗ người cược/cái, bỏ vòng hủy/chưa xong, thứ tự thời gian,
  chuỗi thắng/danh hiệu chỉ hiển thị và không cấp coin.
- API: JWT, feature flag, Origin, Zod, server seed, retry key; từ chối dice/coin/
  actor giả. Notices chỉ đọc và không khởi tạo ví.
- Database: concurrency grant/bet/bonus/settle, chính xác collateral, ví không âm,
  ledger khớp, ví xuyên bàn/phòng không tiêu hai lần, replay trả snapshot mới
  nhưng không chạy mutation lại. So sánh replay bỏ serverNow vì thời gian mới
  có thể khác; vẫn kiểm tra dữ liệu coin/round/ledger.
- Penalty: bật/tắt, loại người chơi/cái, ngưỡng, 0/nonzero, bài QUEUED mới nhất,
  không gỡ PLAYING/PLAYED/bài người khác/phòng khác, không nợ bài tương lai,
  không phạt trùng xuyên bàn, luật snapshot, cạnh tranh reorder/admin remove.
- Restore: quyền/ownership, một lần, từ chối queue/member đầy kể cả bài
  PREPARING/PLAYING; không đổi dữ liệu nếu bị từ chối.
- Security: raw RLS, RPC service-only, private channel, ban/replay sau ban,
  lịch sử riêng tư, quyền moderatorManage/moderatorRestore độc lập, notices
  không lộ hình phạt riêng hoặc cấp ví cho người chỉ nghe nhạc.
- Recovery: minimum/action window/fallback, pause sau settlement, mất cái theo
  ROTATE/PAUSE, hủy/refund, xóa phòng/user, outbox lỗi và gửi lại.
- Browser: hai contexts cùng kết quả, modal xác minh đang mở cập nhật khi reveal,
  retry sau mất response, stale event, reconnect, settings, rời bàn cấm khán giả,
  thông báo ngoài game, restore, iframe host/listener không remount, mobile 390px,
  light theme, reduced motion, WebGL và axe A/AA.
- Regression: nhạc/search/recommendations, queue/vote, chat, host lease/session,
  voice, lucky wheel, Cờ cá ngựa, skin, quản trị, entry/landing.
- Backup: pg_dump/pg_restore sang DB khác, đối chiếu bảng cũ/mới, nội dung ví,
  ledger, rounds, seeds, receipts, outbox và RLS; không phải restore Supabase thật.

Ảnh đã xem ở `test-results/bau/`: desktop-table, desktop-with-host, mobile-3d,
mobile-light, dice-revealed. Mặt trên ba viên khớp kết quả server; iframe active
giữ hiển thị. Đây là ảnh fixture, không phải phòng thật.

## Chạy lại

    pnpm install --frozen-lockfile
    pnpm exec playwright install chromium
    pnpm test
    pnpm test:db
    pnpm test:e2e:bau
    pnpm test:e2e:game
    pnpm test:e2e:room
    pnpm test:e2e:activities
    pnpm test:e2e
    pnpm typecheck
    pnpm lint
    pnpm format:check
    pnpm build:bau

DB và Bầu Cua browser cùng dùng 55439, không chạy đồng thời. Bầu Cua/Ludo/baseline
dùng 5175; room 5174; activities 5176. Test tự dừng process do nó tạo. Nếu sandbox
chặn localhost, cần quyền chạy test ngoài sandbox; timeout mạng sandbox không
chứng minh gameplay lỗi. Full DB cần pg_dump/pg_restore ≥17, Windows mặc định
PostgreSQL 18; đặt PG_BIN khi dùng đường dẫn khác. Không dùng credentials hosted.

## Nghiệm thu hosted và public ngày 17/11/2026

Sau khi người dùng cho phép phát hành, đã sao lưu và áp dụng migrations 007–009.
`scripts/test-bau-hosted.mjs` đạt ở candidate 5181 và HTTPS public với Auth, SQL và
WebSocket thật; không mock API. Mỗi lượt tạo ba danh tính và một phòng tạm, tự dọn
đúng các ID đó, không dùng phòng AE CTV/Nhạc của Doanh.

- Grant/bonus một lần, replay cùng key, membership và notices không tự tạo ví.
- Private Broadcast nhận cược/kết quả/hình phạt; outsider và người bị ban bị từ chối.
- Client không sửa ví, gọi game RPC trực tiếp hoặc đọc seed sớm.
- Xúc xắc ngẫu nhiên thật, kiểm lại commitment, payout, reserve, ledger và hai
  trình duyệt hiển thị cùng kết quả. Tách nhiều bàn không chung trạng thái vòng.
- Phá sản chỉ gỡ bài QUEUED mới nhất của đúng người chơi, giữ playback, nhận
  thông báo, cứu trợ idempotent và khôi phục bài. Điều chỉnh ví chỉ cho user thử.
- Deep link desktop/mobile, reload giữ coin; API Ludo và vòng quay vẫn hoạt động.

Evidence cục bộ: `.roomtune/bau-hosted/e33bc7e8-df47-49a8-8a85-d20da882d1f2`
(candidate) và `.roomtune/bau-hosted/e823eb72-a601-431c-aa3b-0a34a63d3521`
(public). Public đo 87 requests: median 588ms, p95 1068ms; đây là quan sát của
smoke test, không phải SLA hoặc kiểm thử tải lớn. Các ảnh hosted dùng đồ họa nhẹ;
3D/WebGL đã kiểm tra trong bộ E2E cục bộ.

`node scripts/check-bau-public.mjs` đạt 16 kiểm tra HTTPS/routes/quyền, 225 asset
hash khớp bản phát hành, đường dẫn nội bộ 404 và Origin lạ 403.

Chạy có chủ đích (tạo và tự dọn dữ liệu thử trên project chỉ định):

    pnpm test:hosted:bau --project-ref <PROJECT_REF> --base-url https://roomtune.dzoanh.me
    node scripts/check-bau-public.mjs

## Giới hạn bằng chứng

Auth, WebSocket delivery và YouTube trong bộ E2E cục bộ vẫn là fixture; kiểm tra
hosted riêng bên trên bổ sung bằng chứng Auth/Realtime/tunnel thật. Chưa thử Bầu
Cua trên hai thiết bị vật lý ở hai mạng, nghe audio thật hoặc đo FPS/quota/CPU hosted.

Tải cục bộ 24 cược + 32 lần đọc đồng thời khoảng 0,54–0,85 giây, bảo toàn ledger;
không dùng làm SLA. Khóa kinh tế chung cần đo contention ở quy mô nhiều phòng.

Build cảnh báo chunk Three/R3F ~900 KB minified / 247 KB gzip và main ~681 KB /
204 KB gzip. Scene lazy-load; đồ họa nhẹ bỏ tải scene. Secret scan là heuristic,
không phải kiểm toán hoàn chỉnh. Backup hosted đã đọc được bằng pg_restore --list;
chưa restore archive hosted đó vào dịch vụ Supabase riêng. Xem [vận hành](BAU_CUA_OPERATIONS.md).

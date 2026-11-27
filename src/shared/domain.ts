import type { QueueEntry, Settings } from './contracts';
export function parseYouTubeUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
      return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
    ) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (/^\/shorts\/[^/]+\/?$/.test(url.pathname)) id = url.pathname.split('/')[2];
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function durationSeconds(value: string): number {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  return m
    ? Number(m[1] || 0) * 86400 +
        Number(m[2] || 0) * 3600 +
        Number(m[3] || 0) * 60 +
        Number(m[4] || 0)
    : 0;
}
export function formatTime(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
export function orderQueue(entries: QueueEntry[], mode: Settings['queue_mode']): QueueEntry[] {
  const priority = (a: QueueEntry, b: QueueEntry) => (b.priority ?? 0) - (a.priority ?? 0);
  const list = entries
    .filter((e) => e.status === 'QUEUED')
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  if (mode === 'VOTING')
    return list.sort(
      (a, b) =>
        priority(a, b) ||
        b.vote_count - a.vote_count ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
  if (mode !== 'FAIR')
    return list.sort(
      (a, b) => priority(a, b) || a.position - b.position || a.id.localeCompare(b.id),
    );
  const counts = new Map<string | null, number>();
  const ranks = new Map<string | null, number>();
  const current = entries.find((e) => ['PREPARING', 'PLAYING'].includes(e.status))?.requested_by;
  for (const entry of list) {
    const rank = counts.get(entry.requested_by) ?? 0;
    ranks.set(entry.id, rank);
    counts.set(entry.requested_by, rank + 1);
  }
  return list.sort(
    (a, b) =>
      priority(a, b) ||
      ranks.get(a.id)! - ranks.get(b.id)! ||
      Number(a.requested_by === current) - Number(b.requested_by === current) ||
      a.position - b.position ||
      a.id.localeCompare(b.id),
  );
}
export const errorMessages: Record<string, string> = {
  DUCK_STALE: 'Cuộc đua vừa thay đổi. Dữ liệu đang được đồng bộ lại.',
  DUCK_SONG_DISABLED: 'Chủ phòng đã tắt đua bài hát. Cuộc đua đã xuất phát vẫn tiếp tục.',
  DUCK_SONG_LIMIT: 'Số bài vượt giới hạn đua bài hát của phòng. Hãy giảm số bài tham gia.',
  DUCK_SETTINGS_STALE: 'Cài đặt vừa được thay đổi ở thiết bị khác. Hãy mở lại cài đặt để cập nhật.',
  DUCK_LOCKED: 'Danh sách đã khóa; không thể thay đổi cuộc đua này.',
  DUCK_NOT_READY: 'Cần ít nhất hai vịt và tất cả người chơi đã sẵn sàng.',
  DUCK_ALREADY_JOINED: 'Bạn đã có một chú vịt trong cuộc đua.',
  DUCK_LOBBY_CLOSED: 'Sảnh đã khóa, hết chỗ hoặc bạn đã được mời rời cuộc đua.',
  DUCK_SONG_UNAVAILABLE: 'Một bài hát không còn trong hàng chờ. Hãy chọn lại.',
  DUCK_TOURNAMENT_COMPLETE: 'Giải đã kết thúc hoặc vòng kế tiếp đã được tạo.',
  BAU_INSUFFICIENT_COINS: 'Không đủ coin khả dụng. Coin đang khóa vẫn thuộc ví của bạn.',
  BAU_COLLATERAL: 'Quỹ cái chưa đủ bảo đảm khoản cược này. Hãy giảm số coin.',
  BAU_PHASE: 'Thao tác chưa phù hợp với pha hiện tại. Bàn đã được đồng bộ lại.',
  BAU_BET_CLOSED: 'Vòng đã khóa cược hoặc chưa mở. Coin chưa bị trừ.',
  BAU_BET_LIMIT: 'Mức cược vượt giới hạn của vòng. Hãy kiểm tra luật đang áp dụng.',
  BAU_DEALER_REQUIRED: 'Cần người cầm cái đang online và đủ quỹ.',
  BAU_PLAYERS_REQUIRED: 'Cần ít nhất một người chơi khác đang online để mở vòng.',
  BAU_TABLE_LIMIT: 'Bàn hoặc phòng đã đủ chỗ. Hãy chọn bàn khác.',
  BAU_DISABLED: 'Chủ phòng đang tắt Bầu Cua. Các vòng đã nhận cược vẫn được xử lý.',
  BAU_BONUS_UNAVAILABLE: 'Chưa đủ điều kiện nhận thưởng hoặc bạn đã nhận trong kỳ này.',
  BAU_RESTORE_UNAVAILABLE: 'Bài này không còn đủ điều kiện khôi phục từ hình phạt.',
  WHEEL_EMPTY:
    'Cần ít nhất hai lựa chọn hợp lệ để quay. Với thưởng nhạc, chỉ tính người online có bài đang chờ.',
  TAROT_BUSY: 'Bạn vừa rút bài. Chờ vài giây rồi rút tiếp nhé.',
  ROOM_AI_URL:
    'Base URL phải là địa chỉ https công khai, không dùng localhost hay địa chỉ IP nội bộ.',
  ROOM_AI_INCOMPLETE: 'Cần đủ Base URL, API key và model để bật AI riêng.',
  TAROT_INSUFFICIENT_COINS:
    'Bạn chưa đủ xu để rút bài. Nhận thưởng ngày ở Bầu Cua rồi quay lại nhé.',
  WHEEL_BUSY: 'Phòng vừa quay. Hãy chờ vòng quay hiện tại kết thúc.',
  WHEEL_STALE: 'Có người vừa quay trước bạn. Kết quả đã được cập nhật, hãy xem rồi quay lại.',
  GAME_ACTION_INVALID: 'Thao tác không phù hợp với trạng thái ván hiện tại.',
  DELETE_NAME_MISMATCH: 'Tên đã thay đổi. Hãy tải lại và xác nhận đúng tên trước khi xóa.',
  GAME_NOT_YOUR_TURN: 'Chưa đến lượt bạn hoặc xúc xắc đã được tung. Hãy đồng bộ lại bàn.',
  GAME_ILLEGAL_MOVE: 'Quân này không thể đi với số xúc xắc hiện tại.',
  GAME_SEAT_TAKEN: 'Ghế đã có người hoặc bàn không còn nhận người chơi.',
  GAME_NOT_READY: 'Cần ít nhất hai người và tất cả bấm sẵn sàng trước khi bắt đầu.',
  GAME_STALE: 'Bàn cờ vừa thay đổi. Đã yêu cầu đồng bộ; hãy chọn lại thao tác.',
  GAME_TABLE_LIMIT: 'Phòng đã có 8 bàn chưa kết thúc. Hãy tham gia hoặc kết thúc bàn cũ.',
  TYPHU_ACTION_INVALID: 'Thao tác chưa phù hợp với lượt hiện tại của ván Tỷ Phú.',
  TYPHU_NOT_YOUR_TURN: 'Chưa đến lượt bạn. Hãy chờ người chơi hiện tại.',
  TYPHU_PAUSED: 'Ván đang tạm dừng. Bấm Chơi tiếp để tiếp tục.',
  TYPHU_NOT_ENOUGH_CASH: 'Bạn chưa đủ tiền cho thao tác này.',
  TYPHU_BUILD_LIMIT: 'Ô này chưa được xây tới cấp đó ở vòng hiện tại của bạn.',
  TYPHU_BAD_TARGET: 'Mục tiêu đã chọn không hợp lệ cho phiếu hoặc ô này.',
  TYPHU_SEAT_TAKEN: 'Bàn đã đủ người hoặc bạn đã ngồi trong bàn.',
  TYPHU_STALE: 'Ván vừa thay đổi. Đã đồng bộ lại; hãy chọn lại thao tác.',
  TYPHU_TABLE_LIMIT:
    'Phòng đã có 6 bàn Tỷ Phú chưa kết thúc. Hãy vào bàn có sẵn hoặc kết thúc bàn cũ.',
  TYPHU_NOT_READY: 'Cần ít nhất 2 người và mọi người bấm sẵn sàng trước khi bắt đầu.',
  COTUONG_ACTION_INVALID: 'Thao tác chưa phù hợp với ván Cờ Tướng hiện tại.',
  COTUONG_NOT_YOUR_TURN: 'Chưa đến lượt bạn. Hãy chờ đối thủ đi.',
  COTUONG_ILLEGAL_MOVE: 'Nước đi này không hợp lệ.',
  COTUONG_SEAT_TAKEN: 'Bàn đã đủ hai người hoặc bạn đã ngồi trong bàn.',
  COTUONG_STALE: 'Bàn cờ vừa thay đổi. Đã đồng bộ lại; hãy đi lại nước của bạn.',
  COTUONG_TABLE_LIMIT:
    'Phòng đã có 10 bàn Cờ Tướng chưa kết thúc. Hãy vào bàn có sẵn hoặc kết thúc bàn cũ.',
  BILLIARDS_ACTION_INVALID: 'Thao tác chưa phù hợp với ván bi-a hiện tại.',
  BILLIARDS_NOT_YOUR_TURN: 'Chưa đến lượt bạn. Hãy chờ đối thủ đánh.',
  BILLIARDS_BAD_SPOT: 'Không đặt bi cái ở đó được: chạm bi khác hoặc ngoài vùng cho phép.',
  BILLIARDS_SEAT_TAKEN: 'Bàn đã đủ hai người hoặc bạn đã ngồi trong bàn.',
  BILLIARDS_STALE: 'Bàn vừa thay đổi. Đã đồng bộ lại; hãy ngắm lại cú đánh.',
  BILLIARDS_TABLE_LIMIT:
    'Phòng đã có 10 bàn bi-a chưa kết thúc. Hãy vào bàn có sẵn hoặc kết thúc bàn cũ.',
  REORDER_VOTING_DISABLED: 'Phòng chưa bật biểu quyết đổi vị trí bài.',
  REORDER_REQUIRES_APPROVAL: 'Cần biểu quyết đồng ý trước khi đổi vị trí bài.',
  PROPOSAL_EXISTS: 'Phòng đang có một đề xuất chờ biểu quyết. Hãy xử lý đề xuất đó trước.',
  PROPOSAL_CLOSED: 'Đề xuất đã kết thúc hoặc hàng chờ đã thay đổi. Hãy xem lại hàng chờ.',
  NOT_ENOUGH_ONLINE:
    'Cần ít nhất 2 thành viên online để biểu quyết. Bạn không thể tự duyệt đề xuất.',
  PRESENCE_REQUIRED: 'Đang xác nhận bạn online trong phòng. Vui lòng thử lại sau vài giây.',
  QUEUE_CHANGED: 'Hàng chờ vừa thay đổi. Hãy chọn lại vị trí đề xuất.',
  NOT_ELIGIBLE:
    'Bạn chưa có mặt khi đề xuất này được tạo. Bạn có thể tham gia lần biểu quyết tiếp theo.',
  OWNER_ACCOUNT:
    'Tài khoản đang sở hữu phòng. Hãy liên hệ người vận hành để chuyển quyền trước khi xóa.',
  CONFIG_REQUIRED: 'Dịch vụ chưa được cấu hình. Vui lòng liên hệ người quản trị.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  PERMISSION_DENIED: 'Bạn không có quyền thực hiện thao tác này.',
  ROOM_NOT_FOUND: 'Không tìm thấy phòng. Hãy kiểm tra lại mã phòng.',
  ROOM_LOCKED: 'Phòng đang khóa. Hãy liên hệ chủ phòng.',
  ROOM_FULL: 'Phòng đã đủ thành viên.',
  INVALID_PIN: 'Mã PIN chưa đúng.',
  BANNED: 'Bạn không thể tham gia phòng này.',
  QUEUE_FULL: 'Hàng chờ đã đầy. Vui lòng thử lại sau.',
  MEMBER_LIMIT: 'Bạn đã đạt giới hạn bài trong hàng chờ.',
  SONG_ALREADY_QUEUED: 'Bài hát đã có trong hàng chờ.',
  SONG_TOO_LONG: 'Video vượt quá thời lượng cho phép.',
  VIDEO_UNAVAILABLE: 'Video không khả dụng, đang phát trực tiếp hoặc không cho phép nhúng.',
  YOUTUBE_QUOTA_EXCEEDED:
    'YouTube đã hết hạn mức API. Tìm kiếm hoặc kiểm tra bài mới có thể tạm thời không dùng được.',
  ENQUEUE_RATE_LIMITED:
    'Bạn có thể thêm tối đa 12 bài mỗi phút. Hãy chờ khoảng một phút rồi thêm tiếp.',
  YOUTUBE_UNAVAILABLE: 'Chưa thể kết nối YouTube. Hãy thử lại sau.',
  HOST_BUSY: 'Một thiết bị khác đang giữ quyền phát nhạc.',
  STALE_HOST: 'Thiết bị đã mất quyền điều khiển. Hãy nhận lại quyền host.',
  STALE_VERSION: 'Hàng chờ vừa thay đổi. Vui lòng thử lại.',
  STALE_RUN: 'Bài hát đã chuyển. Dữ liệu đang được đồng bộ.',
  RATE_LIMITED: 'Thao tác quá nhanh. Vui lòng chờ một lát.',
  REQUESTS_DISABLED: 'Phòng đang tạm ngừng nhận bài.',
  VOTING_DISABLED: 'Phòng đã tắt bình chọn.',
  INVALID_INPUT: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
  BACKEND_UNAVAILABLE: 'Máy chủ tạm thời không khả dụng. Vui lòng thử lại.',
  IDEMPOTENCY_CONFLICT: 'Mã thao tác đã được dùng với nội dung khác.',
  NOT_FOUND: 'Không tìm thấy dữ liệu.',
  OFFLINE: 'Không có kết nối mạng.',
};
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public retryAfterSeconds?: number,
  ) {
    super(errorMessages[code] ?? errorMessages.BACKEND_UNAVAILABLE);
  }
}

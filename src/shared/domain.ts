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
  const list = entries
    .filter((e) => e.status === 'QUEUED')
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  if (mode === 'VOTING')
    return list.sort(
      (a, b) => b.vote_count - a.vote_count || a.position - b.position || a.id.localeCompare(b.id),
    );
  if (mode !== 'FAIR') return list;
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
      ranks.get(a.id)! - ranks.get(b.id)! ||
      Number(a.requested_by === current) - Number(b.requested_by === current) ||
      a.position - b.position ||
      a.id.localeCompare(b.id),
  );
}
export const errorMessages: Record<string, string> = {
  GAME_ACTION_INVALID: 'Thao tác không phù hợp với trạng thái ván hiện tại.',
  GAME_NOT_YOUR_TURN: 'Chưa đến lượt bạn hoặc xúc xắc đã được tung. Hãy đồng bộ lại bàn.',
  GAME_ILLEGAL_MOVE: 'Quân này không thể đi với số xúc xắc hiện tại.',
  GAME_SEAT_TAKEN: 'Ghế đã có người hoặc bàn không còn nhận người chơi.',
  GAME_NOT_READY: 'Cần ít nhất hai người và tất cả bấm sẵn sàng trước khi bắt đầu.',
  GAME_STALE: 'Bàn cờ vừa thay đổi. Đã yêu cầu đồng bộ; hãy chọn lại thao tác.',
  GAME_TABLE_LIMIT: 'Phòng đã có 8 bàn chưa kết thúc. Hãy tham gia hoặc kết thúc bàn cũ.',
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
  YOUTUBE_QUOTA_EXCEEDED: 'YouTube đã hết hạn mức. Bạn có thể thử dán liên kết.',
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
  ) {
    super(errorMessages[code] ?? errorMessages.BACKEND_UNAVAILABLE);
  }
}

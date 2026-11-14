import { toast } from 'sonner';
import type { RoomCommand } from '../../shared/contracts';

export async function withFeedback<T>(task: () => Promise<T>, loading: string, success?: string) {
  const id = crypto.randomUUID();
  const timer = setTimeout(() => toast.loading(loading, { id }), 450);
  try {
    const result = await task();
    if (success) toast.success(success, { id });
    else toast.dismiss(id);
    return result;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Chưa thể hoàn tất. Vui lòng thử lại.', {
      id,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function commandFeedback(command: RoomCommand, approval: boolean): [string, string] | null {
  switch (command.action) {
    case 'reorder.propose':
      return ['Đang gửi đề xuất…', 'Đã mở biểu quyết. Phiếu đồng ý của bạn đã được tính.'];
    case 'reorder.vote':
      return ['Đang gửi phiếu…', 'Đã ghi nhận lựa chọn của bạn.'];
    case 'reorder.cancel':
      return ['Đang hủy đề xuất…', 'Đã hủy đề xuất đổi vị trí.'];
    case 'enqueue':
      return [
        'Đang thêm bài…',
        approval ? 'Đã gửi yêu cầu duyệt bài.' : 'Đã thêm bài vào hàng chờ.',
      ];
    case 'vote':
      return [
        'Đang lưu bình chọn…',
        command.enabled ? 'Đã bình chọn bài hát.' : 'Đã bỏ bình chọn.',
      ];
    case 'remove':
      return ['Đang xóa bài…', 'Đã xóa bài khỏi hàng chờ.'];
    case 'clear':
      return ['Đang dọn hàng chờ…', 'Đã dọn hàng chờ.'];
    case 'reorder':
      return ['Đang sắp xếp…', 'Đã cập nhật thứ tự phát.'];
    case 'approve':
      return ['Đang duyệt bài…', 'Đã duyệt bài vào hàng chờ.'];
    case 'reject':
      return ['Đang từ chối bài…', 'Đã từ chối yêu cầu bài hát.'];
    case 'settings':
      return ['Đang lưu cài đặt…', 'Đã lưu cài đặt phòng.'];
    case 'rotate_code':
      return [
        'Đang đổi mã phòng…',
        'Đã đổi mã phòng. Liên kết cũ không còn dùng để tham gia được.',
      ];
    case 'claim':
      return ['Đang nhận quyền phát nhạc…', 'Thiết bị đã nhận quyền phát nhạc.'];
    case 'release':
      return ['Đang dừng máy phát…', 'Đã dừng máy phát trên thiết bị này.'];
    case 'play':
      return ['Đang gửi lệnh phát…', 'Đã gửi lệnh phát nhạc.'];
    case 'pause':
      return ['Đang tạm dừng…', 'Đã tạm dừng nhạc.'];
    case 'next':
      return ['Đang chuyển bài…', 'Đã bỏ qua bài hiện tại.'];
    case 'seek':
      return ['Đang chuyển vị trí phát…', 'Đã cập nhật vị trí phát.'];
    case 'kick':
      return ['Đang cập nhật thành viên…', 'Đã đưa thành viên ra khỏi phòng.'];
    case 'ban':
      return ['Đang chặn thành viên…', 'Đã chặn thành viên.'];
    case 'unban':
      return ['Đang bỏ chặn…', 'Đã bỏ chặn thành viên.'];
    case 'moderator':
      return ['Đang cấp quyền…', 'Đã cấp quyền điều hành.'];
    case 'demote':
      return ['Đang thu hồi quyền…', 'Đã thu hồi quyền điều hành.'];
    default:
      return null; // Heartbeats and player callbacks are background work.
  }
}

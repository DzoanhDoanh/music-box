import { useState } from 'react';
import { toast } from 'sonner';
import type { RoomCommand, Settings, Snapshot } from '../../shared/contracts';
import { settingsSchema } from '../../shared/contracts';
import { Button, Confirm } from './ui';
export default function RoomSettings({
  snapshot,
  execute,
}: {
  snapshot: Snapshot;
  execute: (c: RoomCommand) => Promise<unknown>;
}) {
  const [settings, setSettings] = useState(snapshot.settings),
    [name, setName] = useState(snapshot.room.name),
    [description, setDescription] = useState(snapshot.room.description),
    [pin, setPin] = useState(''),
    [changePin, setChangePin] = useState(false),
    [pending, setPending] = useState(false);
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }
  return (
    <form
      className="settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        // Snapshots include database metadata; submit only validated editable fields.
        // Keep the shared command schema strict at the API boundary.
        const parsed = settingsSchema.strip().safeParse(settings);
        if (!parsed.success) {
          toast.error('Hãy kiểm tra lại giới hạn đã nhập.');
          return;
        }
        setPending(true);
        try {
          await execute({
            action: 'settings',
            settings: parsed.data,
            name,
            description,
            ...(changePin ? { pin } : {}),
          });
        } catch {
          /* mutation displays error */
        } finally {
          setPending(false);
        }
      }}
    >
      <h2>Cài đặt phòng</h2>
      <p>Thay đổi được lưu và áp dụng cho cả phòng.</p>
      <fieldset>
        <legend>Phát nhạc ở đâu?</legend>
        <label>
          Thiết bị phát nhạc
          <select
            aria-label="Thiết bị phát nhạc"
            value={settings.playback_mode ?? 'HOST_ONLY'}
            onChange={(e) => update('playback_mode', e.target.value as Settings['playback_mode'])}
            aria-describedby="playback-mode-help"
          >
            <option value="HOST_ONLY">Chỉ máy host — nghe qua loa chung</option>
            <option value="ALL_DEVICES">Tất cả thiết bị — mỗi người nghe trên máy của mình</option>
          </select>
        </label>
        <p id="playback-mode-help">
          {settings.playback_mode === 'ALL_DEVICES'
            ? 'Mỗi người bật nghe một lần trên thiết bị của mình. Máy host điều khiển bài, phát/dừng và chuyển bài chung. Âm lượng của mỗi người độc lập.'
            : 'Chỉ máy nhận quyền phát nhạc có âm thanh. Các thành viên cùng chọn bài và bình chọn.'}
        </p>
      </fieldset>
      <fieldset>
        <legend>Thông tin chung</legend>
        <div className="panel-title">
          <span>Mã phòng: {snapshot.room.code}</span>
          <Confirm
            title="Đổi mã phòng và liên kết mời?"
            onConfirm={() => execute({ action: 'rotate_code' })}
          >
            <Button>Đổi mã phòng</Button>
          </Confirm>
        </div>
        <label>
          Tên phòng
          <input
            value={name}
            minLength={2}
            maxLength={80}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Mô tả
          <textarea
            value={description}
            maxLength={240}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>Hàng chờ & bình chọn</legend>
        <label className="toggle-row">
          <span>Biểu quyết khi đổi vị trí bài</span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.reorder_approval ?? false}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                reorder_approval: event.target.checked,
                queue_mode: event.target.checked ? 'MANUAL' : current.queue_mode,
              }))
            }
          />
        </label>
        <p className="muted">
          Khi bật, mọi thành viên đều có thể đề xuất vị trí. Cần quá nửa số người online lúc tạo đề
          xuất và ít nhất 2 người đồng ý; không ai tự duyệt khi chỉ có một mình. Đề xuất hết hạn sau
          2 phút. Tắt để chủ phòng/người điều hành sắp xếp trực tiếp.
        </p>
        <label>
          Chế độ hàng chờ
          <select
            value={settings.queue_mode}
            disabled={settings.reorder_approval}
            onChange={(e) => update('queue_mode', e.target.value as Settings['queue_mode'])}
          >
            <option value="FIFO">Theo thứ tự yêu cầu</option>
            <option value="VOTING">Ưu tiên lượt bình chọn</option>
            <option value="FAIR">Công bằng giữa thành viên</option>
            <option value="MANUAL">Chủ phòng sắp xếp</option>
          </select>
        </label>
        {settings.reorder_approval && (
          <p className="muted">
            Thứ tự do biểu quyết quyết định; chế độ hàng chờ được giữ ở “Chủ phòng sắp xếp”.
          </p>
        )}
        <div className="form-grid">
          {(
            [
              { key: 'capacity', label: 'Số thành viên tối đa', min: 2, max: 200 },
              { key: 'max_per_member', label: 'Số bài mỗi người', min: 1, max: 30 },
              { key: 'max_queue', label: 'Tổng bài trong hàng chờ', min: 1, max: 500 },
              { key: 'max_duration', label: 'Thời lượng tối đa (giây)', min: 30, max: 14400 },
            ] as const
          ).map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type="number"
                min={f.min}
                max={f.max}
                required
                value={settings[f.key]}
                onChange={(e) => update(f.key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Quyền truy cập & phát nhạc</legend>
        {(
          [
            { key: 'voting', label: 'Cho phép bình chọn' },
            { key: 'allow_duplicates', label: 'Cho phép bài trùng trong hàng chờ' },
            { key: 'allow_remove_own', label: 'Thành viên được xóa bài mình yêu cầu' },
            { key: 'require_approval', label: 'Duyệt bài trước khi vào hàng chờ' },
            { key: 'auto_advance', label: 'Tự chuyển bài khi video kết thúc' },
            { key: 'requests_enabled', label: 'Nhận yêu cầu bài hát' },
            { key: 'locked', label: 'Khóa phòng với thành viên mới' },
          ] as const
        ).map((f) => (
          <label className="toggle-row" key={f.key}>
            <span>{f.label}</span>
            <input
              type="checkbox"
              role="switch"
              checked={settings[f.key]}
              onChange={(e) => update(f.key, e.target.checked)}
            />
          </label>
        ))}
        <label className="toggle-row">
          <span>Thay đổi mã PIN</span>
          <input
            type="checkbox"
            checked={changePin}
            onChange={(e) => setChangePin(e.target.checked)}
          />
        </label>
        {changePin && (
          <label>
            PIN mới (để trống để bỏ PIN)
            <input
              value={pin}
              type="password"
              maxLength={32}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
        )}
      </fieldset>
      <Button variant="primary" type="submit" loading={pending}>
        {pending ? 'Đang lưu…' : 'Lưu cài đặt'}
      </Button>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { duckRoomSettingsSchema, type DuckSnapshot } from '../../../shared/duck-race/contracts';
import { Button } from '../ui';
import type { SendDuck } from './RaceForm';

export function RoomPolicy({
  settings,
  send,
  done,
}: {
  settings: DuckSnapshot['settings'];
  send: SendDuck;
  done: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    duckRoomSettingsSchema.parse({
      songEnabled: settings.songEnabled,
      songOwnerOnly: settings.songOwnerOnly,
      maxSongEntries: settings.maxSongEntries,
      songPriority: settings.songPriority,
    }),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  // Keep the version that this form was opened with: another tab must not be overwritten.
  const [version] = useState(settings.version);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = duckRoomSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      setError('Số bài phải từ 2 đến 30.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await send({ action: 'settings', expectedVersion: version, settings: parsed.data });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="duck-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.songEnabled}
            onChange={(e) => setDraft({ ...draft, songEnabled: e.target.checked })}
          />
          Cho phép đua bài hát
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.songOwnerOnly}
            onChange={(e) => setDraft({ ...draft, songOwnerOnly: e.target.checked })}
          />
          Chỉ chủ phòng được mở đua bài hát
        </label>
        <label>
          Số bài tối đa mỗi cuộc đua
          <input
            type="number"
            min={2}
            max={30}
            required
            value={draft.maxSongEntries}
            onChange={(e) => setDraft({ ...draft, maxSongEntries: Number(e.target.value) })}
          />
        </label>
        <label>
          Bài thắng mặc định
          <select
            value={draft.songPriority}
            onChange={(e) =>
              setDraft({ ...draft, songPriority: e.target.value as typeof draft.songPriority })
            }
          >
            <option value="OFF">Chỉ công bố kết quả</option>
            <option value="APPROVAL">Chủ phòng duyệt đưa lên đầu</option>
            <option value="AUTO">Tự động đưa lên đầu hàng chờ</option>
          </select>
        </label>
        <p className="muted">
          Áp dụng khi tạo, chỉnh sửa và bắt đầu đua bài hát. Cuộc đua đã xuất phát giữ nguyên luật
          và phần thưởng. Phát lại luôn chỉ để xem, không sửa hàng chờ hay cấp thêm coin.
        </p>
        <p className="muted">
          Nếu cho thành viên mở cuộc đua, họ dùng cách xử lý bài thắng ở trên; chỉ chủ phòng được
          thay đổi phần thưởng.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu cài đặt phòng'}
        </Button>
      </fieldset>
    </form>
  );
}

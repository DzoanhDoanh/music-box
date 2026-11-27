import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RoomCommand, Snapshot } from '../../shared/contracts';
import { api } from '../lib/api';
import { musicPlayer } from '../lib/playback-sync';
import { Headphones } from 'lucide-react';
import { AsyncButton, Button, Confirm, ErrorState, Loading } from './ui';
export default function AdminPanel({
  snapshot,
  execute,
}: {
  snapshot: Snapshot;
  execute: (c: RoomCommand) => Promise<unknown>;
}) {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ['admin', snapshot.room.id, page],
    queryFn: () =>
      api<{
        audit: {
          id: string;
          action: string;
          created_at: string;
          actor: string;
        }[];
        bans: {
          user_id: string;
        }[];
      }>(`/rooms/${snapshot.room.id}/admin?page=${page}`),
  });
  const send = (command: RoomCommand) => execute(command);
  // The member whose device plays the room's music, while their lease is alive.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const playback = snapshot.playback;
  const serverNow = now + (snapshot.clock_offset_ms ?? 0);
  const holder = musicPlayer(playback, serverNow);
  const player = holder?.user ?? null;
  const playerName = snapshot.members.find((m) => m.user_id === player)?.name;
  const playing = holder?.playing ?? false;
  const song = snapshot.queue.find((entry) => entry.id === playback.entry_id)?.song.title;
  const playerStatus = playing ? 'Đang phát nhạc' : 'Giữ máy phát · đang dừng';
  return (
    <div>
      <div className="section-heading">
        <h2>Thành viên trong phòng</h2>
        <span className="badge">{snapshot.members.length} người</span>
      </div>
      <p className="member-player" role="status">
        <Headphones size={16} aria-hidden="true" />
        {player && playerName ? (
          <span>
            <b>{playerName}</b> {playing ? 'đang phát nhạc' : 'đang giữ máy phát (tạm dừng)'}
            {song && playing && <> · {song}</>}
          </span>
        ) : (
          <span>Chưa ai giữ máy phát nhạc.</span>
        )}
      </p>
      <p className="muted">
        Mời khỏi phòng để kết thúc quyền truy cập hiện tại. Chọn Chặn nếu muốn ngăn người đó vào lại
        bằng mã phòng.
      </p>
      {snapshot.members.map((member) => (
        <div className="member-row" key={member.user_id}>
          <span className="avatar">{member.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{member.name}</strong>
            {member.user_id === player && (
              <span className={'member-playing' + (playing ? ' live' : '')}>
                <Headphones size={12} aria-hidden="true" /> {playerStatus}
              </span>
            )}
            <small>
              {member.role === 'owner'
                ? 'Chủ phòng'
                : member.role === 'moderator'
                  ? 'Điều hành'
                  : 'Thành viên'}
            </small>
          </div>
          {member.user_id !== snapshot.me &&
            member.role !== 'owner' &&
            (snapshot.role === 'owner' || member.role === 'member') && (
              <div className="member-actions">
                {snapshot.role === 'owner' && (
                  <AsyncButton
                    loadingLabel="Đang cập nhật…"
                    onClick={() =>
                      send({
                        action: member.role === 'moderator' ? 'demote' : 'moderator',
                        user_id: member.user_id,
                      })
                    }
                  >
                    {member.role === 'moderator' ? 'Bỏ điều hành' : 'Cấp điều hành'}
                  </AsyncButton>
                )}
                <Confirm
                  title={`Mời ${member.name} ra khỏi phòng?`}
                  description="Người này sẽ rời phòng nhạc và mất quyền tham gia các bàn chơi. Họ có thể dùng mã phòng để vào lại nếu không bị chặn."
                  onConfirm={() => send({ action: 'kick', user_id: member.user_id })}
                >
                  <Button>Mời khỏi phòng</Button>
                </Confirm>
                <Confirm
                  title={`Chặn ${member.name}?`}
                  onConfirm={() => send({ action: 'ban', user_id: member.user_id })}
                >
                  <Button variant="danger">Chặn</Button>
                </Confirm>
              </div>
            )}
        </div>
      ))}
      <h2>Danh sách chặn</h2>
      {query.isPending ? (
        <Loading>Đang tải danh sách chặn…</Loading>
      ) : query.data?.bans.length ? (
        query.data.bans.map((b) => (
          <div className="member-row" key={b.user_id}>
            <code>{b.user_id.slice(0, 8)}…</code>
            <AsyncButton
              loadingLabel="Đang bỏ chặn…"
              onClick={() => send({ action: 'unban', user_id: b.user_id })}
            >
              Bỏ chặn
            </AsyncButton>
          </div>
        ))
      ) : (
        <p className="muted">Chưa có thành viên bị chặn.</p>
      )}
      <h2>Nhật ký quản trị</h2>
      {query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <div className="audit-list">
          {query.data?.audit.map((event) => (
            <div key={event.id}>
              <strong>
                {(
                  {
                    rotate_code: 'Đổi mã phòng',
                    settings: 'Cập nhật cài đặt',
                    claim: 'Nhận quyền host',
                    clear: 'Dọn hàng chờ',
                    kick: 'Đưa thành viên ra',
                    ban: 'Chặn thành viên',
                    unban: 'Bỏ chặn',
                    remove: 'Xóa bài',
                    approve: 'Duyệt bài',
                    reject: 'Từ chối bài',
                    reorder: 'Sắp xếp hàng chờ',
                    moderator: 'Cấp điều hành',
                    demote: 'Thu hồi điều hành',
                    'game.delete': 'Xóa bàn cờ',
                    'ty_phu.delete': 'Xóa bàn Tỷ Phú',
                    'co_tuong.delete': 'Xóa bàn Cờ Tướng',
                  } as Record<string, string>
                )[event.action] ?? event.action}
              </strong>
              <span>{new Date(event.created_at).toLocaleString('vi-VN')}</span>
            </div>
          ))}
        </div>
      )}
      <div className="pagination">
        <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Trang trước
        </Button>
        <span>Trang {page + 1}</span>
        <Button
          disabled={(query.data?.audit.length ?? 0) < 50}
          onClick={() => setPage((p) => p + 1)}
        >
          Trang sau
        </Button>
      </div>
    </div>
  );
}

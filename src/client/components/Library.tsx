import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Plus, Trash2, ListMusic, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { Library as LibraryData, RoomCommand } from '../../shared/contracts';
import { api, supabase } from '../lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { AsyncButton, Button, Confirm, Empty, ErrorState, Loading, Modal } from './ui';
import { formatTime } from '../../shared/domain';
import { withFeedback } from '../lib/feedback';
import { useSession } from '../lib/session';
export default function Library({
  execute,
}: {
  execute: (c: RoomCommand, options?: { feedback?: boolean }) => Promise<unknown>;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const client = useQueryClient(),
    query = useQuery({ queryKey: ['library'], queryFn: () => api<LibraryData>('/library') }),
    [pending, setPending] = useState(false),
    [open, setOpen] = useState(false),
    [edit, setEdit] = useState<{
      id: string;
      name: string;
    } | null>(null),
    [batch, setBatch] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(0);
  async function mutate(command: unknown) {
    setPending(true);
    try {
      await withFeedback(() => api('/library', command), 'Đang lưu thay đổi…', 'Đã lưu thay đổi.');
      void client.invalidateQueries({ queryKey: ['library'] });
      void client.invalidateQueries({ queryKey: ['room'] });
      setOpen(false);
      setEdit(null);
    } finally {
      setPending(false);
    }
  }
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  return (
    <div className="library">
      <div className="section-heading">
        <h2>
          <Heart size={21} /> Bài yêu thích
        </h2>
        <span className="badge">{query.data.favorites.length} bài</span>
      </div>
      {query.data.favorites.length ? (
        query.data.favorites.map((song) => (
          <div className="song-row" key={song.youtube_video_id}>
            <img src={song.thumbnail} alt="" />
            <div className="song-info">
              <strong>{song.title}</strong>
              <span>
                {song.channel} · {formatTime(song.duration)}
              </span>
            </div>
            <AsyncButton
              size="icon"
              aria-label={`Thêm ${song.title}`}
              onClick={() =>
                execute({ action: 'enqueue', video_id: song.youtube_video_id }).catch(() => {})
              }
            >
              <Plus size={18} />
            </AsyncButton>
            <AsyncButton
              size="icon"
              aria-label="Bỏ yêu thích"
              onClick={() =>
                mutate({ action: 'favorite', video_id: song.youtube_video_id, enabled: false })
              }
            >
              <Heart size={18} fill="currentColor" />
            </AsyncButton>
            <select
              aria-label="Lưu vào playlist"
              disabled={pending}
              value=""
              onChange={(e) => {
                if (e.target.value)
                  void mutate({
                    action: 'playlist.add',
                    id: e.target.value,
                    video_id: song.youtube_video_id,
                  }).catch(() => {});
              }}
            >
              <option value="">Lưu vào…</option>
              {query.data.playlists.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ))
      ) : (
        <Empty title="Giữ lại những bài bạn thích">
          Nhấn biểu tượng trái tim bên cạnh bài hát trong hàng chờ.
        </Empty>
      )}
      <div className="section-heading">
        <h2>
          <ListMusic size={21} /> Playlist của bạn
        </h2>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> Tạo playlist
        </Button>
      </div>
      {query.data.playlists.map((playlist) => (
        <section className="playlist panel" key={playlist.id}>
          <div className="panel-title">
            <h3>
              {playlist.name} <span className="muted">· {playlist.items.length} bài</span>
            </h3>
            <div>
              <AsyncButton
                disabled={Boolean(batch) || !playlist.items.length}
                loadingLabel={`Đang thêm ${batchCount}/${Math.min(20, playlist.items.length)}…`}
                onClick={async () => {
                  setBatch(playlist.id);
                  setBatchCount(0);
                  let count = 0;
                  const total = Math.min(20, playlist.items.length);
                  try {
                    await withFeedback(
                      async () => {
                        try {
                          for (const item of playlist.items.slice(0, 20)) {
                            await execute(
                              { action: 'enqueue', video_id: item.song.youtube_video_id },
                              { feedback: false },
                            );
                            setBatchCount(++count);
                          }
                        } catch (error) {
                          throw new Error(
                            `Đã gửi ${count}/${total} bài. ${error instanceof Error ? error.message : 'Hãy thử lại.'}`,
                            { cause: error },
                          );
                        }
                      },
                      'Đang thêm playlist vào phòng…',
                      `Đã gửi ${total} bài vào phòng. Mỗi lượt tối đa 20 bài.`,
                    );
                  } finally {
                    setBatch(null);
                  }
                }}
              >
                {batch === playlist.id ? 'Đang thêm…' : 'Thêm vào hàng chờ'}
              </AsyncButton>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Đổi tên playlist"
                onClick={() => setEdit({ id: playlist.id, name: playlist.name })}
              >
                <Pencil size={16} />
              </Button>
              <Confirm
                title="Xóa playlist này?"
                onConfirm={() => mutate({ action: 'playlist.delete', id: playlist.id })}
              >
                <Button size="icon" variant="ghost" aria-label="Xóa playlist">
                  <Trash2 size={16} />
                </Button>
              </Confirm>
            </div>
          </div>
          {playlist.items.map((item) => (
            <div className="song-row" key={item.id}>
              <img src={item.song.thumbnail} alt="" />
              <div className="song-info">
                <strong>{item.song.title}</strong>
                <span>{item.song.channel}</span>
              </div>
              <AsyncButton
                size="icon"
                aria-label="Thêm vào hàng chờ"
                onClick={() =>
                  execute({ action: 'enqueue', video_id: item.song.youtube_video_id }).catch(
                    () => {},
                  )
                }
              >
                <Plus size={17} />
              </AsyncButton>
              <AsyncButton
                size="icon"
                aria-label="Xóa khỏi playlist"
                onClick={() =>
                  mutate({ action: 'playlist.remove', id: playlist.id, item_id: item.id })
                }
              >
                <Trash2 size={16} />
              </AsyncButton>
            </div>
          ))}
          {!playlist.items.length && (
            <p className="muted">Lưu bài yêu thích vào playlist bằng menu “Lưu vào…”.</p>
          )}
        </section>
      ))}
      <Modal
        open={open || Boolean(edit)}
        onOpenChange={(value) => {
          if (pending) return;
          if (!value) {
            setOpen(false);
            setEdit(null);
          }
        }}
        title={edit ? 'Đổi tên playlist' : 'Playlist mới'}
        description="Một bộ sưu tập cho những tâm trạng của bạn."
      >
        <form
          key={edit?.id ?? 'new'}
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get('name'));
            void mutate(
              edit
                ? { action: 'playlist.rename', id: edit.id, name }
                : { action: 'playlist.create', name },
            ).catch(() => {});
          }}
        >
          <label>
            Tên playlist
            <input name="name" defaultValue={edit?.name ?? ''} required maxLength={80} />
          </label>
          <Button type="submit" variant="primary" loading={pending} loadingLabel="Đang lưu…">
            Lưu playlist
          </Button>
        </form>
      </Modal>
      <section className="panel profile-form">
        <h2>Hồ sơ của bạn</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get('name'));
            void mutate({ action: 'profile', name })
              .then(() => localStorage.setItem('roomtune:name', name))
              .catch(() => {});
          }}
        >
          <label>
            Tên hiển thị
            <input
              name="name"
              defaultValue={query.data.name}
              required
              minLength={2}
              maxLength={40}
            />
          </label>
          <Button type="submit" loading={pending} loadingLabel="Đang lưu…">
            Cập nhật tên
          </Button>
        </form>
        <div className="profile-actions">
          <AsyncButton
            loadingLabel="Đang xuất dữ liệu…"
            onClick={async () => {
              try {
                const data = await api<Record<string, unknown>>('/export');
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'roomtune-data.json';
                link.click();
                toast.success('Đã chuẩn bị tệp dữ liệu để tải xuống.');
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Xuất dữ liệu của tôi
          </AsyncButton>
          <Button asChild>
            <Link to="/rooms">Các phòng của tôi</Link>
          </Button>
          {session && (
            <Confirm
              title={
                session.user.is_anonymous ? 'Quên phiên trên thiết bị này?' : 'Đăng xuất tài khoản?'
              }
              description={
                session.user.is_anonymous
                  ? 'Bạn sẽ mất phiên khách và cần tham gia lại bằng mã phòng. Nếu chỉ muốn nghỉ nghe, hãy dùng Rời phòng để lần sau vào lại ngay.'
                  : 'Bạn cần đăng nhập tài khoản để mở lại các phòng. Nếu chỉ muốn nghỉ nghe, hãy dùng Rời phòng.'
              }
              onConfirm={() =>
                withFeedback(
                  async () => {
                    const result = await supabase?.auth.signOut();
                    if (result?.error) throw result.error;
                    client.clear();
                    navigate('/');
                  },
                  'Đang đăng xuất…',
                  'Đã đăng xuất trên thiết bị này.',
                )
              }
            >
              <Button variant={session.user.is_anonymous ? 'ghost' : 'danger'}>
                {session.user.is_anonymous ? 'Quên phiên trên thiết bị này' : 'Đăng xuất'}
              </Button>
            </Confirm>
          )}
        </div>
        <Confirm
          title="Xóa tài khoản và dữ liệu cá nhân?"
          onConfirm={() =>
            withFeedback(
              async () => {
                await api('/account/delete', { confirmation: 'DELETE' });
                await supabase?.auth.signOut({ scope: 'local' });
                client.clear();
                navigate('/');
              },
              'Đang xóa dữ liệu tài khoản…',
              'Đã xóa tài khoản và dữ liệu cá nhân.',
            )
          }
        >
          <Button variant="danger">Xóa tài khoản</Button>
        </Confirm>
        <p className="muted">
          Dùng nút Rời phòng để nghỉ nghe. Lần sau mở ROOMTUNE trên cùng trình duyệt, chọn Vào lại
          phòng để nghe tiếp. Phiên khách được giữ cho đến khi bạn quên phiên hoặc xóa dữ liệu trình
          duyệt.
        </p>
      </section>
    </div>
  );
}

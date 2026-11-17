import { useState } from 'react';
import { ChevronDown, Search, Users, WifiOff } from 'lucide-react';
import type { Member } from '../../shared/contracts';
import { Button, Modal } from './ui';
import './room-members.css';

const roles = { owner: 'Chủ phòng', moderator: 'Điều hành', member: 'Thành viên' };
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .replace(/đ/g, 'd')
    .trim();

export default function RoomMembers({
  members,
  me,
  onlineMembers,
  onManage,
}: {
  members: Member[];
  me: string;
  onlineMembers: string[] | null;
  onManage?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
  const online = onlineMembers === null ? null : new Set(onlineMembers);
  const onlineCount =
    online === null ? null : members.filter((member) => online.has(member.user_id)).length;
  const activeFilter = online === null ? 'all' : filter;
  const visible = members
    .filter(
      (member) =>
        normalize(member.name).includes(normalize(search)) &&
        (activeFilter === 'all' || online!.has(member.user_id) === (activeFilter === 'online')),
    )
    .sort(
      (a, b) =>
        Number(online?.has(b.user_id) ?? false) - Number(online?.has(a.user_id) ?? false) ||
        Number(b.user_id === me) - Number(a.user_id === me) ||
        a.name.localeCompare(b.name, 'vi') ||
        a.user_id.localeCompare(b.user_id),
    );
  return (
    <Modal
      className="room-members-dialog"
      title="Thành viên trong phòng"
      description="Online là đang mở phòng này, kể cả khi đang chơi trò chơi."
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) {
          setSearch('');
          setFilter('all');
        }
      }}
      trigger={
        <Button
          variant="ghost"
          className="room-members-trigger"
          aria-label={
            onlineCount === null
              ? 'Xem thành viên trong phòng'
              : `Xem thành viên: ${onlineCount} đang online`
          }
        >
          <Users size={16} aria-hidden="true" />
          <span>{onlineCount === null ? 'Thành viên' : `${onlineCount} online`}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </Button>
      }
    >
      <div className="room-members-body">
        <p className="room-members-summary" role="status">
          {onlineCount === null ? (
            <>
              <WifiOff size={15} aria-hidden="true" /> Đang cập nhật trạng thái kết nối…
            </>
          ) : (
            <>
              <span className="member-presence-dot" data-online="true" aria-hidden="true" />{' '}
              {onlineCount} online · {members.length - onlineCount} offline
            </>
          )}
        </p>
        <label className="room-members-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Tìm thành viên"
            placeholder="Tìm tên thành viên…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="room-members-filters" role="group" aria-label="Lọc thành viên">
          {(
            [
              ['all', 'Tất cả', members.length],
              ['online', 'Online', onlineCount],
              ['offline', 'Offline', onlineCount === null ? null : members.length - onlineCount],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={activeFilter === value}
              disabled={value !== 'all' && online === null}
              onClick={() => setFilter(value)}
            >
              {label} <span>{count ?? '—'}</span>
            </button>
          ))}
        </div>
        <ul className="room-member-list" aria-label="Danh sách thành viên" tabIndex={0}>
          {visible.map((member) => {
            const state =
              online === null ? 'unknown' : online.has(member.user_id) ? 'online' : 'offline';
            return (
              <li
                key={member.user_id}
                className="room-member-item"
                data-member-id={member.user_id}
                data-presence={state}
              >
                <span className="room-member-avatar" aria-hidden="true">
                  {Array.from(member.name.trim()).slice(0, 2).join('').toLocaleUpperCase('vi') ||
                    '?'}
                  <span
                    className="member-presence-dot"
                    data-online={state === 'online'}
                    data-unknown={state === 'unknown'}
                  />
                </span>
                <div className="room-member-details">
                  <div>
                    <strong>{member.name}</strong>
                    {member.user_id === me && <span className="room-member-self">Bạn</span>}
                  </div>
                  <small>{roles[member.role]}</small>
                </div>
                <span className="room-member-state">
                  {state === 'unknown'
                    ? 'Đang cập nhật'
                    : state === 'online'
                      ? 'Online'
                      : 'Offline'}
                </span>
              </li>
            );
          })}
          {!visible.length && (
            <li className="room-members-empty">
              {search.trim()
                ? 'Không tìm thấy thành viên phù hợp.'
                : activeFilter === 'offline'
                  ? 'Mọi người đều đang online.'
                  : activeFilter === 'online'
                    ? 'Chưa có thành viên online.'
                    : 'Chưa có thành viên.'}
            </li>
          )}
        </ul>
        <p className="room-members-footnote">
          Trạng thái có thể cập nhật chậm khi thiết bị mất mạng hoặc đóng đột ngột.
        </p>
        {onManage && (
          <Button
            onClick={() => {
              setOpen(false);
              onManage();
            }}
          >
            Quản lý / mời thành viên ra
          </Button>
        )}
      </div>
    </Modal>
  );
}

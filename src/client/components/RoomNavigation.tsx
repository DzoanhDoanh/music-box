import { useId, useState } from 'react';
import {
  ChevronDown,
  Ellipsis,
  FolderHeart,
  Gamepad2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { Button, Modal } from './ui';
import './room-navigation.css';

export type RoomTab =
  | 'queue'
  | 'search'
  | 'library'
  | 'history'
  | 'host'
  | 'admin'
  | 'settings'
  | 'games'
  | 'wheel'
  | 'tarot';
export type RoomNavItem = { id: RoomTab; label: string; icon: LucideIcon };
const groups = [
  { label: 'Cá nhân', icon: FolderHeart, tabs: ['library', 'history'] },
  { label: 'Giải trí', icon: Gamepad2, tabs: ['games', 'wheel', 'tarot'] },
  { label: 'Quản lý', icon: SlidersHorizontal, tabs: ['host', 'admin', 'settings'] },
];
export default function RoomNavigation({
  items,
  current,
  onSelect,
  count,
  mobile = false,
}: {
  items: RoomNavItem[];
  current: RoomTab;
  onSelect: (tab: RoomTab) => void;
  count: number;
  mobile?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState(false);
  const prefix = useId();
  const primary = items.filter((item) => ['queue', 'search'].includes(item.id));
  const sections = groups
    .map((group) => ({ ...group, items: items.filter((item) => group.tabs.includes(item.id)) }))
    .filter((group) => group.items.length);
  const select = (tab: RoomTab) => {
    setMore(false);
    onSelect(tab);
  };
  const itemButton = ({ id, label, icon: Icon }: RoomNavItem) => (
    <button
      key={id}
      aria-label={label}
      aria-current={current === id ? 'page' : undefined}
      className={'nav-item' + (current === id ? ' active' : '')}
      onClick={() => select(id)}
    >
      <Icon size={19} aria-hidden="true" />
      <span className="nav-label">{label}</span>
      {id === 'queue' && <span className="nav-count">{count}</span>}
    </button>
  );
  if (mobile)
    return (
      <nav className="mobile-tabs compact-mobile-nav" aria-label="Chọn mục">
        {primary.map(itemButton)}
        <Modal
          open={more}
          onOpenChange={setMore}
          title="Trong phòng của bạn"
          description="Nhạc, trò chơi và các công cụ quản lý."
          className="room-more-dialog"
          trigger={
            <Button
              aria-label="Thêm mục trong phòng"
              className={!primary.some((item) => item.id === current) ? 'active' : ''}
            >
              <Ellipsis size={20} /> Thêm
            </Button>
          }
        >
          {sections.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3>{group.label}</h3>
              {group.items.map(itemButton)}
            </section>
          ))}
        </Modal>
      </nav>
    );
  return (
    <nav aria-label="Điều hướng phòng" className="compact-room-nav">
      {primary.map(itemButton)}
      {sections.map(({ label, icon: Icon, items: children }, index) => {
        const active = children.some((item) => item.id === current);
        const open = expanded[label] ?? active;
        const groupId = `${prefix}-group-${index}`;
        return (
          <div className="room-nav-group" key={label}>
            <button
              className={'nav-item nav-group-toggle' + (active ? ' active-group' : '')}
              aria-expanded={open}
              aria-controls={groupId}
              onClick={() => setExpanded((previous) => ({ ...previous, [label]: !open }))}
            >
              <Icon size={19} aria-hidden="true" />
              <span className="nav-label">{label}</span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            <div id={groupId} className="nav-group-items" hidden={!open}>
              {children.map(itemButton)}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

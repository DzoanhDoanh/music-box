import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, matchPath, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import {
  AudioLines,
  Search,
  Heart,
  History,
  Settings,
  Users,
  MonitorSpeaker,
  ArrowUp,
  ArrowDown,
  Trash2,
  ThumbsUp,
  Radio,
  Plus,
  LogOut,
  Share2,
  Check,
  X,
  Gamepad2,
  ArrowLeft,
  CircleDot,
  Moon,
  Copy,
  UserRound,
} from 'lucide-react';
import { copyText } from '../lib/clipboard';
import { useRoom } from '../lib/room';
import { withFeedback } from '../lib/feedback';
import PlaybackRecovery from '../components/PlaybackRecovery';
import QueueDragHandle from '../components/QueueDragHandle';
import RoomMembers from '../components/RoomMembers';
import GamePicker from '../components/GamePicker';
import RoomNavigation, { type RoomTab as Tab } from '../components/RoomNavigation';
import { ReorderProposalDialog, ReorderVotePanel } from '../components/ReorderVoting';
import { api } from '../lib/api';
import { hostIsAvailable, musicPlayer } from '../lib/playback-sync';
import { AppError, orderQueue, formatTime } from '../../shared/domain';
import { isConnectionError } from '../../shared/auth-errors';
import type { Library as LibraryData, Song } from '../../shared/contracts';
import {
  AsyncButton,
  Brand,
  Button,
  Confirm,
  Empty,
  ErrorState,
  Loading,
  Modal,
} from '../components/ui';
const HostPlayer = lazy(() => import('../components/HostPlayer')),
  GameHub = lazy(() => import('../components/game/GameHub')),
  BauParty = lazy(() => import('../components/bau-cua/BauParty')),
  DuckParty = lazy(() => import('../components/duck-race/DuckParty')),
  TyPhuParty = lazy(() => import('../components/ty-phu/TyPhuParty')),
  CoTuongParty = lazy(() => import('../components/co-tuong/CoTuongParty')),
  BilliardsParty = lazy(() => import('../components/billiards/BilliardsParty')),
  BauNotifications = lazy(() => import('../components/bau-cua/BauNotifications')),
  LuckyWheel = lazy(() => import('../components/LuckyWheel')),
  TarotReading = lazy(() => import('../components/tarot/TarotReading')),
  ListenerPlayer = lazy(() => import('../components/ListenerPlayer')),
  SearchPanel = lazy(() => import('../components/SearchPanel')),
  RoomSettings = lazy(() => import('../components/RoomSettings')),
  Library = lazy(() => import('../components/Library')),
  AdminPanel = lazy(() => import('../components/AdminPanel'));
const ludoEnabled = import.meta.env.VITE_ENABLE_LUDO === 'true';
const bauEnabled = import.meta.env.VITE_ENABLE_BAU_CUA === 'true';
const duckEnabled = import.meta.env.VITE_ENABLE_DUCK_RACE === 'true';
const tyPhuEnabled = import.meta.env.VITE_ENABLE_TY_PHU === 'true';
const coTuongEnabled = import.meta.env.VITE_ENABLE_CO_TUONG === 'true';
const billiardsEnabled = import.meta.env.VITE_ENABLE_BILLIARDS === 'true';
const anyGame =
  ludoEnabled || bauEnabled || duckEnabled || tyPhuEnabled || coTuongEnabled || billiardsEnabled;
const wheelEnabled = import.meta.env.VITE_ENABLE_WHEEL === 'true';
const tarotEnabled = import.meta.env.VITE_ENABLE_TAROT === 'true';
export default function RoomPage() {
  const [hostVisible, setHostVisible] = useState(false);
  const [claimFromListener, setClaimFromListener] = useState<string | null>(null);
  const [proposalEntry, setProposalEntry] = useState<string | null>(null);
  const [hostLease, setHostLease] = useState<{ controller: string; fence: number } | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const navigate = useNavigate();
  const route = useLocation();
  const { id = '' } = useParams(),
    room = useRoom(id),
    client = useQueryClient(),
    [musicTab, setMusicTab] = useState<Tab>('queue'),
    [mine, setMine] = useState(false),
    [drag, setDrag] = useState<{ source: string; target: string } | null>(null);
  const library = useQuery({
    queryKey: ['library'],
    queryFn: () => api<LibraryData>('/library'),
    enabled: !!room.data,
  });
  const [roomCode, setRoomCode] = useState('');
  const gamePage = anyGame && route.pathname.startsWith(`/room/${id}/games`);
  const duckRoute = matchPath('/room/:id/games/duck-race/:race?', route.pathname);
  const duckPage = duckEnabled && !!duckRoute;
  const tyPhuRoute = matchPath('/room/:id/games/ty-phu/:game?', route.pathname);
  const tyPhuPage = tyPhuEnabled && !!tyPhuRoute;
  const coTuongRoute = matchPath('/room/:id/games/co-tuong/:game?', route.pathname);
  const coTuongPage = coTuongEnabled && !!coTuongRoute;
  const billiardsRoute = matchPath('/room/:id/games/bi-a/:game?', route.pathname);
  const billiardsPage = billiardsEnabled && !!billiardsRoute;
  const bauRoute = matchPath('/room/:id/games/bau-cua/:table?', route.pathname);
  const bauPage = bauEnabled && !!bauRoute;
  const gameLobby = gamePage && route.pathname.replace(/\/$/, '') === `/room/${id}/games`;
  const tool = new URLSearchParams(route.search).get('tool');
  const wheelPage = wheelEnabled && tool === 'wheel';
  const tarotPage = tarotEnabled && tool === 'tarot';
  const tab = gamePage ? 'games' : wheelPage ? 'wheel' : tarotPage ? 'tarot' : musicTab;
  const setTab = (next: Tab) => {
    if (next === 'games') navigate(`/room/${id}/games`);
    else if (next === 'wheel') navigate(`/room/${id}?tool=wheel`);
    else if (next === 'tarot') navigate(`/room/${id}?tool=tarot`);
    else {
      setMusicTab(next);
      if (gamePage || wheelPage || tarotPage) navigate(`/room/${id}`);
    }
  };
  useEffect(() => {
    const legacy = new URLSearchParams(route.search).get('game');
    if (ludoEnabled && legacy)
      navigate(`/room/${id}/games/${encodeURIComponent(legacy)}`, { replace: true });
  }, [id, route.search, navigate]);
  useEffect(() => {
    if (room.data) setRoomCode(room.data.room.code);
  }, [room.data]);
  const sessionLost = room.error instanceof AppError && room.error.code === 'UNAUTHORIZED';
  const accessRevoked =
    room.error instanceof AppError &&
    ['PERMISSION_DENIED', 'ROOM_NOT_FOUND', 'NOT_FOUND', 'BANNED'].includes(room.error.code);
  useEffect(() => {
    if (!accessRevoked) return;
    toast.info('Phòng đã được xóa hoặc bạn không còn là thành viên của phòng.', {
      id: 'room-access-' + id,
    });
    void client.invalidateQueries({ queryKey: ['rooms'] });
    navigate('/rooms', { replace: true });
  }, [accessRevoked, id, client, navigate]);
  useEffect(() => {
    if (sessionLost) toast.dismiss();
  }, [sessionLost]);
  if (room.isPending) return <Loading />;
  if (sessionLost)
    return (
      <main className="page-content session-recovery">
        <Brand />
        <h1>Khôi phục phiên để nghe tiếp</h1>
        <p>Phiên trên thiết bị này không còn hợp lệ. Phòng và hàng chờ vẫn được giữ.</p>
        <div className="dialog-actions">
          <Button asChild variant="primary">
            <Link to={`/login?room=${encodeURIComponent(id)}`}>Đăng nhập lại</Link>
          </Button>
          <Button asChild>
            <Link to={`/join${roomCode ? `?code=${encodeURIComponent(roomCode)}` : ''}`}>
              Tham gia lại bằng tên
            </Link>
          </Button>
          <AsyncButton onClick={() => room.refetch()} loadingLabel="Đang kiểm tra…">
            Kiểm tra lại phiên
          </AsyncButton>
        </div>
      </main>
    );
  if (!room.data || (room.error && !isConnectionError(room.error)))
    return <ErrorState error={room.error} retry={() => void room.refetch()} />;
  const snapshot = room.data,
    playerKey = `${id}:${snapshot.me}`,
    manager = snapshot.role !== 'member',
    me = snapshot.members.find((m) => m.user_id === snapshot.me),
    active = snapshot.queue.find((e) => e.id === snapshot.playback.entry_id),
    ordered = orderQueue(snapshot.queue, snapshot.settings.queue_mode),
    queue = mine ? ordered.filter((e) => e.requested_by === snapshot.me) : ordered,
    favorites = new Set(
      Array.isArray(library.data?.favorites)
        ? library.data.favorites.map((song) => song.youtube_video_id)
        : [],
    );
  const send = (c: Parameters<typeof room.execute>[0]) => room.execute(c);
  const nav: {
    id: Tab;
    label: string;
    icon: typeof Radio;
  }[] = [
    { id: 'queue', label: 'Không gian nghe', icon: Radio },
    { id: 'search', label: 'Tìm & thêm bài', icon: Search },
    { id: 'library', label: 'Thư viện của tôi', icon: Heart },
    { id: 'history', label: 'Lịch sử phát', icon: History },
    ...(anyGame ? [{ id: 'games' as const, label: 'Trò chơi', icon: Gamepad2 }] : []),
    ...(wheelEnabled
      ? [{ id: 'wheel' as const, label: 'Vòng quay may mắn', icon: CircleDot }]
      : []),
    ...(tarotEnabled ? [{ id: 'tarot' as const, label: 'Bói Tarot', icon: Moon }] : []),
    ...(manager
      ? [
          { id: 'host' as const, label: 'Máy phát nhạc', icon: MonitorSpeaker },
          { id: 'admin' as const, label: 'Quản lý thành viên', icon: Users },
        ]
      : []),
    ...(snapshot.role === 'owner'
      ? [{ id: 'settings' as const, label: 'Cài đặt phòng', icon: Settings }]
      : []),
  ];
  const showQueue = tab === 'queue' || tab === 'host';
  const canReorder =
    manager && snapshot.settings.queue_mode === 'MANUAL' && !snapshot.settings.reorder_approval;
  const showHost = !leaving && hostVisible && manager;
  const showListener = !leaving && snapshot.settings.playback_mode === 'ALL_DEVICES' && !hostLease;
  const invite = `${location.origin}/join?code=${snapshot.room.code}`;
  async function copyInvite(text = invite, label = 'liên kết mời') {
    if (await copyText(text)) toast.success(`Đã sao chép ${label}.`);
    else toast.error(`Không sao chép được. Mã phòng: ${snapshot.room.code}`);
  }
  async function shareInvite() {
    try {
      await navigator.share({
        title: snapshot.room.name,
        text: `Vào nghe nhạc cùng mình trên ROOMTUNE · mã phòng ${snapshot.room.code}`,
        url: invite,
      });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') await copyInvite();
    }
  }
  async function leaveRoom() {
    setLeaving(true);
    try {
      if (hostLease)
        await room.execute({
          action: 'release',
          controller_id: hostLease.controller,
          fence: hostLease.fence,
        });
    } catch {
      // Local audio stops immediately; an unreachable host lease expires on the server.
      toast.info('Đã dừng nhạc trên máy này. Quyền host sẽ tự hết hạn nếu mất kết nối.');
    } finally {
      void client.invalidateQueries({ queryKey: ['rooms'] });
      navigate('/rooms', { replace: true });
    }
  }
  async function removeOwn(entry: string, video: string) {
    await send({ action: 'remove', entry_id: entry });
    toast('Đã xóa bài khỏi hàng chờ.', {
      action: {
        label: 'Thêm lại',
        onClick: () => void send({ action: 'enqueue', video_id: video }).catch(() => {}),
      },
    });
  }
  function reorder(entry: string, target: string) {
    if (snapshot.settings.reorder_approval) return Promise.resolve();
    const ids = ordered.map((e) => e.id),
      a = ids.indexOf(entry),
      b = ids.indexOf(target);
    if (a < 0 || b < 0 || a === b) return Promise.resolve();
    ids.splice(a, 1);
    ids.splice(b, 0, entry);
    return send({ action: 'reorder', ids, version: snapshot.version });
  }
  return (
    <div
      className={
        'dashboard' +
        (gamePage
          ? ' game-screen'
          : wheelPage
            ? ' wheel-screen'
            : tarotPage
              ? ' wheel-screen tarot-screen'
              : '')
      }
    >
      {bauEnabled && !accessRevoked && !sessionLost && (
        <Suspense fallback={null}>
          <BauNotifications room={id} actor={snapshot.me} />
        </Suspense>
      )}
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-room">
          <span className="room-symbol">
            <AudioLines size={23} />
          </span>
          <div>
            <strong>{snapshot.room.name}</strong>
            <small>Không gian âm nhạc</small>
          </div>
        </div>
        <span className="nav-caption">TRONG PHÒNG</span>
        <RoomNavigation
          items={nav}
          current={tab}
          count={ordered.length}
          onSelect={(target) => {
            setTab(target);
            if (target === 'host') setHostVisible(true);
          }}
        />
        <div className="sidebar-bottom">
          <div className="invite-card">
            <Radio size={20} />
            <strong>Nhạc hay hơn khi có nhau.</strong>
            <p>Mời bạn bè vào phòng và cùng chọn bài.</p>
            <Button onClick={() => void copyInvite()}>
              <Share2 size={15} /> Sao chép lời mời
            </Button>
          </div>
          <Link to="/rooms" className="nav-item">
            ← Các phòng của tôi
          </Link>
          <button className="nav-item" onClick={() => setTab('library')}>
            <UserRound size={17} /> Hồ sơ & phiên
          </button>
        </div>
      </aside>
      <div className="dashboard-content">
        <header className="dashboard-top">
          <div className="room-presence-heading">
            <span className={`connection ${room.connection === 'Đã kết nối' ? 'connected' : ''}`}>
              <i />
              <span className="room-connection-label">{room.connection}</span>
            </span>
            <span className="header-divider" />
            <RoomMembers
              onManage={manager ? () => setTab('admin') : undefined}
              key={playerKey}
              members={snapshot.members}
              me={snapshot.me}
              onlineMembers={room.onlineMembers}
              player={musicPlayer(snapshot.playback, Date.now() + (snapshot.clock_offset_ms ?? 0))}
            />
          </div>
          <div className="room-actions">
            <div className="user-chip">
              <span className="avatar">{me?.name.slice(0, 2).toUpperCase()}</span>
              <span>{me?.name ?? 'Thành viên'}</span>
            </div>
            <Modal
              open={leaveOpen}
              trigger={
                <Button className="leave-room-button" disabled={leaving}>
                  <LogOut size={17} /> Rời phòng
                </Button>
              }
              onOpenChange={(open) => {
                if (!leaving) setLeaveOpen(open);
              }}
              title="Rời phòng?"
              description={
                hostLease
                  ? 'Máy này đang giữ quyền host. Khi bạn rời phòng, nhạc chung sẽ dừng đến khi có máy host tiếp nhận. Phòng và hàng chờ vẫn được giữ.'
                  : 'Âm thanh trên thiết bị này sẽ dừng. Phòng và phiên của bạn vẫn được giữ. Lần sau chọn Vào lại phòng để nghe tiếp, không cần nhập mã.'
              }
            >
              <div className="dialog-actions">
                <Button onClick={() => setLeaveOpen(false)} disabled={leaving}>
                  Ở lại
                </Button>
                <Button variant="danger" onClick={() => void leaveRoom()} loading={leaving}>
                  {leaving ? 'Đang rời phòng…' : 'Rời phòng ngay'}
                </Button>
              </div>
            </Modal>
          </div>
        </header>

        <main className="dashboard-main">
          {gamePage && (
            <header className="game-screen-header">
              <Button onClick={() => setTab('queue')} variant="ghost">
                <ArrowLeft size={17} /> Về phòng nhạc
              </Button>
              <span className="game-room-label">
                <AudioLines size={16} /> {snapshot.room.name}
              </span>
              <span className="game-chat-slot" aria-hidden="true" />
            </header>
          )}
          {room.error && (
            <div className="notice" role="status">
              Đang kết nối lại để đồng bộ phòng. Bạn không cần tải lại trang.
            </div>
          )}
          <div className="room-heading">
            <div>
              <span className="eyebrow">KHÔNG GIAN CỦA CHÚNG MÌNH</span>
              <h1>
                {snapshot.room.name}
                <span className="heading-dot">.</span>
              </h1>
              <p>{snapshot.room.description || 'Một chút âm nhạc, một ngày dễ chịu hơn.'}</p>
            </div>
            <Modal
              title="Mời bạn bè cùng nghe"
              description="Quét mã QR hoặc nhập mã phòng để tham gia."
              trigger={
                <Button aria-label="Mời bạn bè">
                  <Share2 size={17} />
                  <span>Mời bạn bè</span>
                </Button>
              }
            >
              <div className="qr">
                <QRCodeSVG
                  title="Mã QR tham gia phòng"
                  value={invite}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#16121e"
                  marginSize={3}
                />
                <strong>{snapshot.room.code}</strong>
                <a href={invite}>{invite}</a>
                <div className="qr-actions">
                  <Button variant="primary" onClick={() => void copyInvite()}>
                    <Copy size={15} /> Sao chép liên kết
                  </Button>
                  <Button onClick={() => void copyInvite(snapshot.room.code, 'mã phòng')}>
                    <Copy size={15} /> Sao chép mã
                  </Button>
                  {typeof navigator.share === 'function' && (
                    <Button onClick={() => void shareInvite()}>
                      <Share2 size={15} /> Chia sẻ
                    </Button>
                  )}
                </div>
              </div>
            </Modal>
          </div>
          <RoomNavigation
            mobile
            items={nav}
            current={tab}
            count={ordered.length}
            onSelect={(target) => {
              setTab(target);
              if (target === 'host') setHostVisible(true);
            }}
          />
          {proposalEntry &&
            ordered.find((entry) => entry.id === proposalEntry) &&
            snapshot.settings.reorder_approval && (
              <ReorderProposalDialog
                key={proposalEntry}
                entry={ordered.find((entry) => entry.id === proposalEntry)!}
                ordered={ordered}
                execute={send}
                onClose={() => setProposalEntry(null)}
              />
            )}
          <div className="room-workspace">
            <div className="room-playback">
              {showHost && (
                <Suspense fallback={<Loading />}>
                  <HostPlayer
                    key={playerKey}
                    snapshot={snapshot}
                    execute={room.execute}
                    onOwnershipChange={setHostLease}
                    claimOnMount={claimFromListener === playerKey}
                    onClaimRequestHandled={() =>
                      setClaimFromListener((request) => (request === playerKey ? null : request))
                    }
                  />
                </Suspense>
              )}
              {showListener && (
                <Suspense fallback={<Loading />}>
                  <ListenerPlayer
                    key={playerKey}
                    snapshot={snapshot}
                    onCheckHost={() =>
                      withFeedback(async () => {
                        const result = await room.refetch();
                        if (result.error) throw result.error;
                        if (
                          result.data &&
                          !hostIsAvailable(
                            result.data.playback,
                            Date.now() + (result.data.clock_offset_ms ?? 0),
                          )
                        ) {
                          toast.info(
                            'Phòng vẫn đang chờ host. Chủ phòng hoặc quản trị viên cần nhận quyền phát nhạc.',
                          );
                        }
                      }, 'Đang kiểm tra máy host…')
                    }
                    onOpenHost={
                      manager && !showHost
                        ? () => {
                            setClaimFromListener(playerKey);
                            setHostVisible(true);
                            setTab('host');
                          }
                        : undefined
                    }
                  />
                </Suspense>
              )}
              <section className="now-playing" aria-label="Thông tin bài hát trong phòng">
                <div className="now-art">
                  {active ? (
                    <img src={active.song.thumbnail} alt="" />
                  ) : (
                    <div className="mini-record">
                      <AudioLines size={42} />
                    </div>
                  )}
                </div>
                <div className="now-info">
                  <span className="now-label">
                    <span className="equalizer">
                      <i />
                      <i />
                      <i />
                    </span>
                    {active ? 'ĐANG TRONG PHÒNG' : 'SẴN SÀNG CHO GIAI ĐIỆU ĐẦU TIÊN'}
                  </span>
                  <h2>{active?.song.title ?? 'Một bài hát để bắt đầu.'}</h2>
                  <p>
                    {active ? active.song.channel : 'Thêm bài bạn thích. Cả phòng sẽ cùng nghe.'}
                  </p>
                  {active ? (
                    <div className="now-meta">
                      <span>Yêu cầu bởi {active.requester}</span>
                      <span>
                        {
                          (
                            {
                              PLAYING: 'Đang phát',
                              PAUSED: 'Tạm dừng',
                              LOADING: 'Đang tải',
                              NEEDS_USER_GESTURE: 'Chờ host cho phép',
                              BUFFERING: 'Đang tải đệm',
                              WAITING_FOR_HOST: 'Chờ host',
                              IDLE: 'Sẵn sàng',
                              ERROR: 'Chờ xử lý lỗi phát nhạc',
                            } as Record<string, string>
                          )[snapshot.playback.state]
                        }
                      </span>
                    </div>
                  ) : tab !== 'search' ? (
                    <Button variant="primary" onClick={() => setTab('search')}>
                      <Plus size={16} /> Chọn bài đầu tiên
                    </Button>
                  ) : null}
                  <p className="playback-mode-note">
                    <MonitorSpeaker size={14} aria-hidden="true" />
                    {snapshot.settings.playback_mode === 'HOST_ONLY'
                      ? 'Âm thanh phát ở máy host'
                      : 'Mỗi thiết bị có thể bật nghe'}
                  </p>
                </div>
                <div className="now-decoration">
                  <AudioLines size={76} />
                </div>
              </section>
              {!showHost && !showListener && active && snapshot.playback.state === 'ERROR' && (
                <PlaybackRecovery
                  message="Máy host chưa phát được bài này. Bạn có thể mở bài trên YouTube trong lúc chờ host xử lý."
                  videoId={active.youtube_video_id}
                  title={active.song.title}
                  position={snapshot.playback.position}
                />
              )}
              {showQueue && (
                <aside className="room-detail panel">
                  <div className="panel-title">
                    <h3>Cùng trong phòng</h3>
                    <Users size={18} />
                  </div>
                  <div className="avatar-stack">
                    {snapshot.members.slice(0, 6).map((m) => (
                      <span className="avatar" key={m.user_id} title={m.name}>
                        {m.name.slice(0, 1).toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <p>{snapshot.members.length} người, mỗi người một gu.</p>
                  <hr />
                  <span className="nav-caption">MÃ PHÒNG</span>
                  <strong className="room-code">{snapshot.room.code}</strong>
                  <QRCodeSVG
                    title="Mã QR tham gia phòng"
                    value={invite}
                    size={144}
                    bgColor="#fff"
                    fgColor="#17121d"
                    marginSize={3}
                  />
                  <p className="muted">Quét mã để cùng hòa nhịp.</p>
                  <hr />
                  <small>
                    <Check size={14} /> Hàng chờ được lưu sau mỗi thao tác.
                  </small>
                </aside>
              )}
            </div>
            <div className="room-content">
              <ReorderVotePanel snapshot={snapshot} execute={send} />
              {gameLobby && (
                <GamePicker
                  room={id}
                  ludo={ludoEnabled}
                  bau={bauEnabled}
                  duck={duckEnabled}
                  tyPhu={tyPhuEnabled}
                  coTuong={coTuongEnabled}
                  billiards={billiardsEnabled}
                />
              )}
              {billiardsPage && (
                <Suspense fallback={<Loading />}>
                  <BilliardsParty snapshot={snapshot} game={billiardsRoute.params.game ?? null} />
                </Suspense>
              )}
              {coTuongPage && (
                <Suspense fallback={<Loading />}>
                  <CoTuongParty snapshot={snapshot} game={coTuongRoute.params.game ?? null} />
                </Suspense>
              )}
              {tyPhuPage && (
                <Suspense fallback={<Loading />}>
                  <TyPhuParty snapshot={snapshot} game={tyPhuRoute.params.game ?? null} />
                </Suspense>
              )}
              {duckPage && (
                <Suspense fallback={<Loading />}>
                  <DuckParty
                    key={playerKey + ':' + (duckRoute.params.race ?? 'lobby')}
                    snapshot={snapshot}
                    raceId={duckRoute.params.race ?? null}
                  />
                </Suspense>
              )}
              {bauPage && (
                <Suspense fallback={<Loading />}>
                  <BauParty
                    key={playerKey + ':' + (bauRoute.params.table ?? 'lobby')}
                    snapshot={snapshot}
                    table={bauRoute.params.table ?? null}
                  />
                </Suspense>
              )}
              {ludoEnabled && (
                <Suspense fallback={tab === 'games' ? <Loading /> : null}>
                  <GameHub
                    key={playerKey}
                    snapshot={snapshot}
                    visible={
                      tab === 'games' &&
                      !bauPage &&
                      !duckPage &&
                      !tyPhuPage &&
                      !coTuongPage &&
                      !billiardsPage
                    }
                    onShow={() => setTab('games')}
                  />
                </Suspense>
              )}
              <Suspense fallback={<Loading />}>
                {tab === 'wheel' && <LuckyWheel key={playerKey} snapshot={snapshot} />}
                {tab === 'tarot' && <TarotReading key={playerKey} snapshot={snapshot} />}
                {showQueue && (
                  <>
                    <div className="queue-layout">
                      <section className="queue-panel" aria-label="Hàng chờ phát nhạc">
                        <div className="section-heading">
                          <div>
                            <h2>
                              Tiếp theo <span className="count">{ordered.length}</span>
                            </h2>
                            <p>
                              {snapshot.settings.reorder_approval
                                ? 'Đổi vị trí bài cần được cả nhóm biểu quyết'
                                : {
                                    FIFO: 'Theo thứ tự yêu cầu',
                                    VOTING: 'Bình chọn để bài bạn thích được phát sớm hơn',
                                    FAIR: 'Luân phiên giữa các thành viên',
                                    MANUAL: 'Chủ phòng sắp xếp thứ tự phát',
                                  }[snapshot.settings.queue_mode]}
                            </p>
                          </div>
                          <Button variant="primary" onClick={() => setTab('search')}>
                            <Plus size={17} /> Thêm bài
                          </Button>
                        </div>
                        <div className="queue-toolbar">
                          <div>
                            <button
                              className={!mine ? 'selected' : ''}
                              aria-pressed={!mine}
                              onClick={() => setMine(false)}
                            >
                              Tất cả
                            </button>
                            <button
                              className={mine ? 'selected' : ''}
                              aria-pressed={mine}
                              onClick={() => setMine(true)}
                            >
                              Bài của tôi
                            </button>
                          </div>
                          {manager && ordered.length > 0 && (
                            <Confirm
                              title="Xóa toàn bộ hàng chờ?"
                              onConfirm={() => send({ action: 'clear' })}
                            >
                              <Button variant="ghost">
                                <Trash2 size={15} /> Dọn hàng chờ
                              </Button>
                            </Confirm>
                          )}
                        </div>
                        {canReorder && queue.length > 1 && (
                          <p className="queue-drag-help">
                            Giữ nút Kéo để đổi vị trí bài, hoặc dùng mũi tên lên / xuống.
                          </p>
                        )}
                        {queue.length ? (
                          queue.map((entry, index) => (
                            <article
                              className="queue-row"
                              key={entry.id}
                              data-queue-id={entry.id}
                              data-drag-source={drag?.source === entry.id}
                              data-drop-target={
                                drag?.target === entry.id && drag.source !== entry.id
                              }
                              data-drop-edge={
                                drag && queue.findIndex((item) => item.id === drag.source) < index
                                  ? 'after'
                                  : 'before'
                              }
                            >
                              {canReorder ? (
                                <QueueDragHandle
                                  entry={entry.id}
                                  title={entry.song.title}
                                  ids={queue.map((item) => item.id)}
                                  disabled={room.pending || queue.length < 2}
                                  onPreview={setDrag}
                                  onMove={reorder}
                                />
                              ) : (
                                <span className="queue-number">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                              )}
                              <img src={entry.song.thumbnail} alt="" loading="lazy" />
                              <div className="song-info">
                                <a
                                  href={`https://www.youtube.com/watch?v=${entry.youtube_video_id}`}
                                  target="_blank"
                                  rel="noopener"
                                >
                                  {entry.song.title}
                                </a>
                                <span>
                                  {entry.song.channel} <b>·</b> {entry.requester}
                                </span>
                                {(entry.priority ?? 0) > 0 && (
                                  <small className="queue-reward">Ưu tiên từ vòng quay</small>
                                )}
                              </div>
                              <span className="song-duration">
                                {formatTime(entry.song.duration)}
                              </span>
                              {!snapshot.settings.reorder_approval && (
                                <AsyncButton
                                  className={entry.voted ? 'vote voted' : 'vote'}
                                  aria-label={`${entry.voted ? 'Bỏ bình chọn' : 'Bình chọn'} ${entry.song.title}`}
                                  disabled={!snapshot.settings.voting}
                                  onClick={() =>
                                    send({
                                      action: 'vote',
                                      entry_id: entry.id,
                                      enabled: !entry.voted,
                                    })
                                  }
                                >
                                  <ThumbsUp size={15} />
                                  {entry.vote_count}
                                </AsyncButton>
                              )}
                              {snapshot.settings.reorder_approval && (
                                <Button
                                  className="propose-position"
                                  aria-label={`Đề xuất vị trí cho ${entry.song.title}`}
                                  disabled={
                                    ordered.length < 2 ||
                                    (snapshot.reorder?.online_count ?? 0) < 2 ||
                                    snapshot.reorder?.proposal?.status === 'OPEN'
                                  }
                                  onClick={() => setProposalEntry(entry.id)}
                                >
                                  <ArrowUp size={16} /> Đề xuất vị trí
                                </Button>
                              )}
                              {(() => {
                                const favorite = favorites.has(entry.youtube_video_id);
                                return (
                                  <AsyncButton
                                    variant="ghost"
                                    size="icon"
                                    className={favorite ? 'favorite-active' : undefined}
                                    aria-pressed={favorite}
                                    aria-label={`${favorite ? 'Bỏ yêu thích' : 'Lưu yêu thích'} ${entry.song.title}`}
                                    title={favorite ? 'Bỏ khỏi yêu thích' : 'Lưu vào yêu thích'}
                                    onClick={() =>
                                      withFeedback(
                                        () =>
                                          api('/library', {
                                            action: 'favorite',
                                            video_id: entry.youtube_video_id,
                                            enabled: !favorite,
                                          }),
                                        favorite
                                          ? 'Đang bỏ khỏi yêu thích…'
                                          : 'Đang lưu bài yêu thích…',
                                        favorite
                                          ? 'Đã bỏ khỏi yêu thích.'
                                          : 'Đã lưu vào yêu thích.',
                                      )
                                        .then(() => {
                                          void client.invalidateQueries({ queryKey: ['library'] });
                                        })
                                        .catch(() => {})
                                    }
                                  >
                                    <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />
                                  </AsyncButton>
                                );
                              })()}
                              {(manager ||
                                (entry.requested_by === snapshot.me &&
                                  snapshot.settings.allow_remove_own)) &&
                                (entry.requested_by === snapshot.me ? (
                                  <AsyncButton
                                    size="icon"
                                    variant="ghost"
                                    aria-label={`Xóa ${entry.song.title} khỏi hàng chờ`}
                                    title="Xóa khỏi hàng chờ"
                                    onClick={() => removeOwn(entry.id, entry.youtube_video_id)}
                                  >
                                    <X size={16} />
                                  </AsyncButton>
                                ) : (
                                  <Confirm
                                    title="Xóa bài của người khác?"
                                    description={`“${entry.song.title}” do ${entry.requester} yêu cầu sẽ bị xóa khỏi hàng chờ của cả phòng.`}
                                    onConfirm={() => send({ action: 'remove', entry_id: entry.id })}
                                  >
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      aria-label={`Xóa ${entry.song.title} khỏi hàng chờ`}
                                      title="Xóa khỏi hàng chờ"
                                    >
                                      <X size={16} />
                                    </Button>
                                  </Confirm>
                                ))}
                              {manager &&
                                snapshot.settings.queue_mode === 'MANUAL' &&
                                !snapshot.settings.reorder_approval && (
                                  <div className="reorder-buttons">
                                    <AsyncButton
                                      size="icon"
                                      variant="ghost"
                                      aria-label="Đưa bài lên"
                                      disabled={room.pending || index === 0}
                                      onClick={() => reorder(entry.id, queue[index - 1].id)}
                                    >
                                      <ArrowUp size={14} />
                                    </AsyncButton>
                                    <AsyncButton
                                      size="icon"
                                      variant="ghost"
                                      aria-label="Đưa bài xuống"
                                      disabled={room.pending || index === queue.length - 1}
                                      onClick={() => reorder(entry.id, queue[index + 1].id)}
                                    >
                                      <ArrowDown size={14} />
                                    </AsyncButton>
                                  </div>
                                )}
                            </article>
                          ))
                        ) : (
                          <Empty
                            title={
                              mine
                                ? 'Bạn chưa yêu cầu bài nào'
                                : 'Hàng chờ đang chờ gu nhạc của bạn'
                            }
                            action={
                              <Button onClick={() => setTab('search')}>
                                Khám phá bài hát <Search size={16} />
                              </Button>
                            }
                          >
                            Tìm một giai điệu phù hợp và thêm vào không gian chung.
                          </Empty>
                        )}
                        {snapshot.queue
                          .filter((e) => e.status === 'PENDING')
                          .map((e) => (
                            <div className="song-row" key={e.id}>
                              <div className="song-info">
                                <strong>{e.song.title}</strong>
                                <span>Đang chờ duyệt · {e.requester}</span>
                              </div>
                              {manager && (
                                <>
                                  <AsyncButton
                                    aria-label="Duyệt bài"
                                    onClick={() => send({ action: 'approve', entry_id: e.id })}
                                  >
                                    <Check size={16} />
                                  </AsyncButton>
                                  <AsyncButton
                                    aria-label="Từ chối bài"
                                    onClick={() => send({ action: 'reject', entry_id: e.id })}
                                  >
                                    <X size={16} />
                                  </AsyncButton>
                                </>
                              )}
                            </div>
                          ))}
                      </section>
                    </div>
                  </>
                )}
                {tab === 'search' && <SearchPanel snapshot={snapshot} execute={room.execute} />}
                {tab === 'settings' && snapshot.role === 'owner' && (
                  <RoomSettings snapshot={snapshot} execute={room.execute} />
                )}
                {tab === 'library' && <Library execute={room.execute} />}
                {tab === 'admin' && manager && (
                  <AdminPanel snapshot={snapshot} execute={room.execute} />
                )}
                {tab === 'history' && (
                  <HistoryPanel
                    roomId={id}
                    add={(video) => send({ action: 'enqueue', video_id: video })}
                  />
                )}
              </Suspense>
            </div>
          </div>
        </main>
        <footer className="dashboard-footer">
          <AudioLines size={15} /> ROOMTUNE <span>Chung một nhịp.</span>
          <span>Âm nhạc từ YouTube</span>
        </footer>
      </div>
    </div>
  );
}
function HistoryPanel({ roomId, add }: { roomId: string; add: (id: string) => Promise<unknown> }) {
  const [page, setPage] = useState(0),
    [filter, setFilter] = useState('');
  const needle = filter.trim().toLocaleLowerCase();
  const query = useQuery({
    queryKey: ['history', roomId, page],
    queryFn: () =>
      api<{
        items: {
          id: string;
          status: string;
          played_at: string;
          entry: {
            song: Song;
            requester: {
              name: string;
            };
          };
        }[];
      }>(`/rooms/${roomId}/history?page=${page}`),
  });
  return (
    <div>
      <div className="section-heading">
        <h2>Lịch sử phát</h2>
        <input
          aria-label="Lọc lịch sử trang hiện tại"
          placeholder="Lọc bài trong trang…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : query.data.items.length ? (
        (() => {
          const matches = query.data.items.filter(
            (e) =>
              !needle ||
              e.entry.song.title.toLocaleLowerCase().includes(needle) ||
              e.entry.song.channel.toLocaleLowerCase().includes(needle),
          );
          if (!matches.length)
            return (
              <Empty
                title="Không có bài nào khớp"
                action={<Button onClick={() => setFilter('')}>Xóa bộ lọc</Button>}
              >
                Bộ lọc chỉ tìm trong trang lịch sử hiện tại.
              </Empty>
            );
          return matches.map((e) => (
            <article className="song-row" key={e.id}>
              <img src={e.entry.song.thumbnail} alt="" />
              <div className="song-info">
                <strong>{e.entry.song.title}</strong>
                <span>
                  {e.entry.requester?.name ?? 'Thành viên đã rời phòng'} ·{' '}
                  {new Date(e.played_at).toLocaleString('vi-VN')}
                </span>
              </div>
              <span className="badge">
                {e.status === 'PLAYED'
                  ? 'Đã phát'
                  : e.status === 'FAILED'
                    ? 'Lỗi video'
                    : 'Đã bỏ qua'}
              </span>
              <AsyncButton
                aria-label={`Thêm lại ${e.entry.song.title}`}
                title="Thêm lại vào hàng chờ"
                size="icon"
                onClick={() => add(e.entry.song.youtube_video_id)}
              >
                <Plus size={17} />
              </AsyncButton>
            </article>
          ));
        })()
      ) : (
        <Empty title="Chưa có bài hát đã phát">
          Những giai điệu cả phòng đã nghe sẽ được lưu tại đây.
        </Empty>
      )}
      <div className="pagination" hidden={page === 0 && (query.data?.items.length ?? 0) < 25}>
        <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Trang trước
        </Button>
        <span>Trang {page + 1}</span>
        <Button
          disabled={(query.data?.items.length ?? 0) < 25}
          onClick={() => setPage((p) => p + 1)}
        >
          Trang sau
        </Button>
      </div>
    </div>
  );
}

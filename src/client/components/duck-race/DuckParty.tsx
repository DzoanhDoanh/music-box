import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Flag,
  Maximize,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Snapshot } from '../../../shared/contracts';
import { duckSkins, type DuckSkin, type DuckSnapshot } from '../../../shared/duck-race/contracts';
import { verifyRace } from '../../../shared/duck-race/fairness';
import { nextEntries } from '../../../shared/duck-race/engine';
import { useDuckRace } from '../../lib/duck-race';
import { AsyncButton, Button, Confirm, Empty, ErrorState, Loading, Modal } from '../ui';
import { RaceForm } from './RaceForm';
import { RoomPolicy } from './RoomPolicy';
import { cameras, maps, readGraphics, skins, type CameraMode } from './design';
import {
  displayFinished,
  elapsedRace,
  positionsAt,
  waitingForFrames,
  type RacePlayback,
  type Replay,
} from './playback';
import { DuckAudio } from './audio';
// The dedicated game layout must load even when the Ludo feature is disabled.
import '../game/game.css';
import './duck-race.css';
const Scene = lazy(() => import('./DuckScene'));
const Preview = lazy(() => import('./DuckPreview'));
const statusNames = {
  LOBBY: 'Đang nhận vịt',
  COUNTDOWN: 'Sắp xuất phát',
  RACING: 'Đang đua',
  FINISHED: 'Đã về đích',
  CANCELLED: 'Đã hủy',
};
const modeNames = { PLAYER: 'Thành viên', SONG: 'Bài hát', CUSTOM: 'Tùy chọn' };
function SkinBadge({ skin, small = false }: { skin: DuckSkin; small?: boolean }) {
  return (
    <span
      className={'duck-skin-badge' + (small ? ' small' : '')}
      style={{ '--duck-color': skins[skin].color } as CSSProperties}
      aria-label={skins[skin].name}
    >
      <span aria-hidden="true">{skins[skin].icon}</span>
    </span>
  );
}
export default function DuckParty({
  snapshot,
  raceId,
}: {
  snapshot: Snapshot;
  raceId: string | null;
}) {
  const state = useDuckRace(snapshot.room.id, snapshot.me, raceId),
    navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const open = (id: string) => {
    setCreating(false);
    navigate(`/room/${snapshot.room.id}/games/duck-race/${id}`);
  };
  const data = state.data;
  return (
    <section className="duck-party">
      <header className="duck-page-heading">
        <div>
          <span className="eyebrow">ROOMTUNE PLAY / RIVER CLUB</span>
          <h1>
            Duck Race <em>Party</em>
            <span className="duck-title-dot">●</span>
          </h1>
        </div>
        <Button asChild variant="ghost">
          <Link to={`/room/${snapshot.room.id}/games${raceId ? '/duck-race' : ''}`}>
            <ArrowLeft size={16} />
            {raceId ? 'Các cuộc đua' : 'Trò chơi'}
          </Link>
        </Button>
      </header>
      {state.retry && (
        <div className="notice" role="status">
          Kết nối bị gián đoạn khi gửi thao tác. Xác minh để tránh gửi hai lần.
          <AsyncButton onClick={() => state.send()}>Xác minh thao tác</AsyncButton>
        </div>
      )}
      {state.query.error && data && (
        <div className="notice" role="status">
          Đang kết nối lại. Vịt sẽ chờ dữ liệu mới, kết quả vẫn do server giữ.
          <AsyncButton onClick={() => state.query.refetch()}>Kết nối lại</AsyncButton>
        </div>
      )}
      {state.query.isPending ? (
        <Loading>Đang mở dòng sông…</Loading>
      ) : !data ? (
        <ErrorState error={state.query.error} retry={() => void state.query.refetch()} />
      ) : data.race && raceId ? (
        <RaceRoom key={data.race.id} snapshot={snapshot} data={data} state={state} open={open} />
      ) : (
        <>
          <div className="duck-hero">
            <div className="duck-hero-copy">
              <span className="duck-pill">NHỮNG CUỘC ĐUA, NHỮNG NIỀM VUI</span>
              <h2>
                Một dòng sông.
                <br />
                <em>Vô vàn bất ngờ.</em>
              </h2>
              <p>
                Chọn chú vịt của bạn, rủ cả phòng lên đường.
                <br />
                Cùng cổ vũ và chờ xem ai cán đích đầu tiên.
              </p>
              {snapshot.role === 'owner' ||
              (data.settings.songEnabled && !data.settings.songOwnerOnly) ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus size={18} /> Tạo cuộc đua
                </Button>
              ) : (
                <span className="duck-pill">Chọn cuộc đua bên dưới để tham gia</span>
              )}
              {snapshot.role === 'owner' && (
                <Button variant="ghost" onClick={() => setPolicyOpen(true)}>
                  <Settings2 size={16} /> Cài đặt đua của phòng
                </Button>
              )}
            </div>
            <div className="duck-hero-art" aria-hidden="true">
              <span>☀</span>
              <i />
              <b>🦆</b>
              <b>🦆</b>
              <b>🦆</b>
              <small>READY, SET, QUACK!</small>
            </div>
          </div>
          <div className="duck-hub-columns">
            <section>
              <div className="duck-section-title">
                <h2>Hẹn nhau bên sông</h2>
                <span className="muted">
                  {
                    data.races.filter((r) => ['LOBBY', 'COUNTDOWN', 'RACING'].includes(r.status))
                      .length
                  }{' '}
                  cuộc đang mở
                </span>
              </div>
              <div className="duck-race-list">
                {data.races
                  .filter((r) => r.status !== 'FINISHED' && r.status !== 'CANCELLED')
                  .map((r) => (
                    <button key={r.id} onClick={() => open(r.id)}>
                      <span className="duck-race-icon">🦆</span>
                      <span>
                        <strong>{r.name}</strong>
                        <small>
                          {modeNames[r.mode]} · {r.count} vịt · {statusNames[r.status]}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
              </div>
              {!data.races.some((r) => ['LOBBY', 'COUNTDOWN', 'RACING'].includes(r.status)) && (
                <Empty title="Dòng sông đang chờ">
                  Chủ phòng có thể mở cuộc đua cho thành viên, bài hát hoặc một danh sách bất kỳ.
                </Empty>
              )}
              <h3>Những lần về đích gần đây</h3>
              <div className="duck-race-list">
                {data.races
                  .filter((r) => r.status === 'FINISHED' || r.status === 'CANCELLED')
                  .map((r) => (
                    <button key={r.id} onClick={() => open(r.id)}>
                      <span className="duck-race-icon">{r.status === 'FINISHED' ? '🏁' : '○'}</span>
                      <span>
                        <strong>{r.name}</strong>
                        <small>
                          {new Date(r.createdAt).toLocaleString('vi-VN')} · {statusNames[r.status]}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
              </div>
              <small className="muted">Hiển thị 50 cuộc đua gần nhất.</small>
            </section>
            <aside className="duck-hall">
              <span className="eyebrow">RIVER HALL OF FAME</span>
              <h2>
                <Trophy size={22} /> Gương mặt vàng
              </h2>
              {data.leaderboard.length ? (
                data.leaderboard.map((p, i) => (
                  <div className="duck-score-row" key={p.userId}>
                    <b>{i + 1}</b>
                    <span>
                      {p.name}
                      <small>{p.races} lượt tham gia</small>
                    </span>
                    <strong>{p.wins} 🏆</strong>
                  </div>
                ))
              ) : (
                <p className="muted">Chiếc cúp đầu tiên đang chờ một chủ nhân.</p>
              )}
              <div className="duck-fair-note">
                <ShieldCheck size={21} />
                <p>
                  Mọi vịt đều có cơ hội như nhau. Kết quả được lưu và có thể tự kiểm chứng sau mỗi
                  cuộc đua.
                </p>
              </div>
            </aside>
          </div>
          <Modal
            title="Mở một cuộc đua"
            description="Chọn đường đua và những người bạn đồng hành."
            open={creating}
            onOpenChange={setCreating}
            className="duck-wide-dialog"
          >
            <RaceForm
              snapshot={snapshot}
              settings={data.settings}
              presets={data.presets}
              send={state.send}
              done={open}
            />
          </Modal>
          <Modal
            title="Cài đặt đua của phòng"
            description="Quyền mở cuộc đua bài hát và cách xử lý bài thắng."
            open={policyOpen}
            onOpenChange={setPolicyOpen}
          >
            <RoomPolicy
              settings={data.settings}
              send={state.send}
              done={() => setPolicyOpen(false)}
            />
          </Modal>
        </>
      )}
    </section>
  );
}
function RaceRoom({
  snapshot,
  data,
  state,
  open,
}: {
  snapshot: Snapshot;
  data: DuckSnapshot;
  state: ReturnType<typeof useDuckRace>;
  open: (id: string) => void;
}) {
  const race = data.race!;
  const [graphics, setGraphics] = useState(readGraphics),
    [camera, setCamera] = useState<CameraMode>('AUTO'),
    [follow, setFollow] = useState('');
  const [settings, setSettings] = useState(false),
    [editing, setEditing] = useState(false),
    [invite, setInvite] = useState(false),
    [picker, setPicker] = useState(false);
  // Phones default to the 2D board, where an open ranking would cover the lanes.
  const [showRanking, setShowRanking] = useState(() => !readGraphics().twoD);
  const [chosen, setChosen] = useState<DuckSkin>(
    () => race.entries.find((e) => e.userId === snapshot.me)?.skin ?? 'YELLOW',
  );
  const [team, setTeam] = useState(''),
    [replay, setReplay] = useState<Replay | null>(null),
    [, setTick] = useState(performance.now());
  const [metrics, setMetrics] = useState({ fps: 0, calls: 0 }),
    slow = useRef(0);
  const [proof, setProof] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const view = useRef<RacePlayback>({ race, ...state.clock.current, replay });
  view.current = { race, ...state.clock.current, replay };
  const stage = useRef<HTMLDivElement>(null);
  const audio = useMemo(() => new DuckAudio(), []);
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => {
    // Restored volume waits for a real gesture, respecting browser autoplay policies.
    const unlock = () => audio.setVolume(graphics.volume);
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [audio, graphics.volume]);
  useEffect(() => {
    const timer = setInterval(() => setTick(performance.now()), 160);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('roomtune:duck:graphics:v1', JSON.stringify(graphics));
    } catch {
      /* ephemeral preferences */
    }
  }, [graphics]);
  // A snapshot can arrive between HUD ticks. Sample its clock at render time rather
  // than projecting the new anchor backwards to the previous tick.
  const tick = performance.now();
  const elapsed = elapsedRace(view.current, tick),
    buffering = waitingForFrames(view.current, tick),
    finished = displayFinished(view.current, tick),
    lobby = race.status === 'LOBBY',
    cancelled = race.status === 'CANCELLED';
  const me = race.entries.find((e) => e.userId === snapshot.me),
    manage = snapshot.role === 'owner' || race.host === snapshot.me;
  const running = !lobby && !cancelled && !finished;
  // The server marks a race finished before the delayed playback reaches the line.
  const revealed = race.status !== 'FINISHED' || finished;
  const shownStatus = revealed ? race.status : 'RACING';
  const nextRace =
    race.status === 'FINISHED' && revealed
      ? data.races
          .slice(
            0,
            Math.max(
              0,
              data.races.findIndex((r) => r.id === race.id),
            ),
          )
          .find((r) => r.status === 'LOBBY' || r.status === 'COUNTDOWN')
      : undefined;
  const showMine = () => {
    if (!me) return;
    if (graphics.twoD) {
      stage.current
        ?.querySelector(`[data-entry="${me.id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setFollow(me.id);
      setCamera('LEADER');
    }
  };
  const order = [...race.entries].sort((a, b) => a.id.localeCompare(b.id));
  const positions = positionsAt(view.current, tick);
  const leaderboard = order
    .map((entry, i) => ({ entry, position: positions[i] ?? 0 }))
    .sort((a, b) => b.position - a.position || a.entry.id.localeCompare(b.entry.id));
  const cues = useRef({ second: -99, leader: '', last: 0, finish: false, sprint: false });
  useEffect(() => {
    if (replay || lobby || cancelled) return;
    const second = Math.ceil(-elapsed / 1000);
    if (second !== cues.current.second && second >= 0 && second <= 3) {
      audio.play(second ? 'tick' : 'start');
      cues.current.second = second;
    }
    if (!cues.current.sprint && elapsed >= race.config.duration * 800) {
      audio.play('sprint');
      cues.current.sprint = true;
    }
    if (finished && !cues.current.finish) {
      audio.play('finish');
      cues.current.finish = true;
    }
    const leader = leaderboard[0]?.entry.id;
    if (
      leader &&
      cues.current.leader &&
      leader !== cues.current.leader &&
      elapsed - cues.current.last > 5000 &&
      running &&
      elapsed > 5000
    ) {
      audio.play('overtake');
      cues.current.last = elapsed;
    }
    cues.current.leader = leader;
  }, [
    elapsed,
    finished,
    replay,
    lobby,
    cancelled,
    audio,
    leaderboard,
    running,
    race.config.duration,
  ]);
  const failGraphics = useCallback(() => {
    setGraphics((g) => ({ ...g, twoD: true }));
    toast.info('Đã chuyển sang bảng đua 2D vì thiết bị chưa dựng được cảnh 3D.');
  }, []);
  const performanceReport = useCallback(
    (fps: number, calls: number) => {
      setMetrics({ fps, calls });
      slow.current = fps < 24 ? slow.current + 1 : 0;
      if (slow.current >= 3 && graphics.autoQuality && graphics.quality !== 'LOW') {
        slow.current = 0;
        setGraphics((g) => ({
          ...g,
          quality: g.quality === 'HIGH' ? 'MEDIUM' : 'LOW',
          // Reduce effects first. Never automatically render below native CSS resolution.
          resolution: g.quality === 'HIGH' ? g.resolution : Math.min(g.resolution, 1),
        }));
        toast.info('Đã giảm chất lượng hình ảnh để cuộc đua mượt hơn.');
      }
    },
    [graphics.autoQuality, graphics.quality],
  );
  async function verify() {
    if (!race.seed || !race.lockedHash) return;
    setProof('checking');
    try {
      setProof(
        (await verifyRace(race, race.seed, race.commitment, race.lockedHash, race.results))
          ? 'valid'
          : 'invalid',
      );
    } catch {
      setProof('invalid');
    }
  }
  const share = `${location.origin}/join?code=${encodeURIComponent(snapshot.room.code)}&duck=${race.id}`;
  const replayAt = (at: number, speed = replay?.speed ?? 1, paused = false) =>
    setReplay({ at, speed, paused, anchor: performance.now() });
  const canNext =
    race.config.tournament.kind !== 'SINGLE' &&
    race.round < race.config.tournament.rounds &&
    nextEntries(race.entries, race.results, race.config).length >= 2;
  const tournamentDone = race.config.tournament.kind !== 'SINGLE' && finished && !canNext;
  const champions =
    race.config.tournament.kind === 'ELIMINATION'
      ? race.entries.filter((e) => e.id === race.results[0]?.entryId).map((e) => e.name)
      : data.standings
          .filter(
            (e) => e.points === data.standings[0]?.points && e.wins === data.standings[0]?.wins,
          )
          .map((e) => e.name);
  const myPlace = me ? leaderboard.findIndex((e) => e.entry.id === me.id) + 1 : 0;
  const photoGap = race.results[1] ? race.results[1].finishMs - race.results[0].finishMs : null;
  return (
    <>
      <div className="duck-race-heading">
        <div>
          <span className="duck-pill">
            <span className={state.query.error ? 'duck-offline' : 'duck-live-dot'} />
            {state.query.error ? 'Đang kết nối lại' : statusNames[shownStatus]} ·{' '}
            {modeNames[race.config.mode]}
          </span>
          <h2>{race.name}</h2>
          <p>
            {maps[race.config.track].name} · {race.config.duration} giây · {race.entries.length}/
            {race.config.capacity} vịt
            {race.config.tournament.kind !== 'SINGLE' &&
              ` · Vòng ${race.round}/${race.config.tournament.rounds}`}
          </p>
          <small className="muted">
            {snapshot.room.name} · Chủ cuộc đua:{' '}
            {snapshot.members.find((m) => m.user_id === race.host)?.name ?? 'Thành viên'}
            {!me && race.config.mode === 'PLAYER' ? ' · Bạn đang xem và cổ vũ' : ''}
          </small>
        </div>
        <div className="duck-actions">
          <Button onClick={() => setInvite(true)}>
            <Users size={16} /> Mời bạn
          </Button>
          <Button onClick={() => setSettings(true)} aria-label="Hình ảnh và âm thanh">
            <Settings2 size={18} />
          </Button>
        </div>
      </div>
      {lobby ? (
        <div className="duck-lobby-grid">
          <section className={`duck-lobby-showcase map-${race.config.track.toLowerCase()}`}>
            <div className="duck-section-title">
              <span className="eyebrow">MEET YOUR LITTLE CHAMPION</span>
              <span>
                {maps[race.config.track].icon} {maps[race.config.track].name}
              </span>
            </div>
            <div className="duck-preview">
              <Suspense fallback={<SkinBadge skin={chosen} />}>
                <Preview skin={chosen} reduced={graphics.reducedMotion} twoD={graphics.twoD} />
              </Suspense>
            </div>
            <h2>{skins[chosen].name}</h2>
            <p>Nhỏ xíu, nhưng biết đâu lại về nhất.</p>
            {race.config.mode === 'PLAYER' && (
              <Button onClick={() => setPicker(true)}>Đổi phong cách vịt</Button>
            )}
            <div className="duck-fair-note">
              <ShieldCheck size={18} />
              <span>Trang phục không ảnh hưởng cơ hội chiến thắng.</span>
            </div>
          </section>
          <section className="duck-lobby-members">
            <div className="duck-section-title">
              <h3>Đội hình xuất phát</h3>
              <span>{race.entries.length} vịt</span>
            </div>
            <div className="duck-member-list">
              {race.entries.map((e) => (
                <div key={e.id}>
                  <SkinBadge skin={e.skin} small />
                  <span>
                    <strong>
                      {e.name}
                      {e.userId === snapshot.me ? ' (bạn)' : ''}
                    </strong>
                    <small>
                      {e.requestedBy ? `Đề cử bởi ${e.requestedBy}` : e.team || skins[e.skin].name}
                      {e.userId === race.host ? ' · Chủ cuộc đua' : ''}
                    </small>
                  </span>
                  <span className={'duck-ready' + (e.ready ? ' yes' : '')}>
                    {e.ready ? (
                      <>
                        <Check size={14} /> Sẵn sàng
                      </>
                    ) : (
                      'Đang chọn'
                    )}
                  </span>
                  {manage &&
                    e.userId &&
                    e.userId !== snapshot.me &&
                    e.userId !== snapshot.room.owner_id && (
                      <Confirm
                        title={`Mời ${e.name} rời cuộc đua?`}
                        description="Người này vẫn ở trong phòng nhạc nhưng không thể tham gia lại cuộc đua hiện tại."
                        children={
                          <Button size="icon" aria-label={`Mời ${e.name} rời cuộc đua`}>
                            <X size={14} />
                          </Button>
                        }
                        onConfirm={() => state.send({ action: 'kick', user: e.userId! })}
                      />
                    )}
                </div>
              ))}
            </div>
            {race.entries.length === 0 && (
              <p className="duck-lobby-empty">Chiếc vé đầu tiên dành cho bạn 🦆</p>
            )}
            {race.config.mode === 'PLAYER' && (
              <div className="duck-join-actions">
                {me ? (
                  <>
                    <AsyncButton
                      variant={me.ready ? 'secondary' : 'primary'}
                      disabled={state.pending || state.retry}
                      onClick={() => state.send({ action: 'ready', ready: !me.ready })}
                    >
                      <Check size={17} />
                      {me.ready ? 'Chưa sẵn sàng' : 'Tôi đã sẵn sàng'}
                    </AsyncButton>
                    <AsyncButton
                      variant="ghost"
                      disabled={state.pending || state.retry}
                      onClick={() => state.send({ action: 'leave' })}
                    >
                      Chỉ xem
                    </AsyncButton>
                  </>
                ) : (
                  <>
                    {race.config.tournament.kind === 'TEAM' && (
                      <label>
                        Đội của bạn
                        <input
                          value={team}
                          maxLength={30}
                          onChange={(e) => setTeam(e.target.value)}
                          placeholder="Ví dụ: Nắng"
                        />
                      </label>
                    )}
                    <AsyncButton
                      variant="primary"
                      disabled={
                        state.pending ||
                        state.retry ||
                        race.previousId !== null ||
                        race.lobbyClosed ||
                        race.banned.includes(snapshot.me) ||
                        race.entries.length >= race.config.capacity
                      }
                      onClick={() => state.send({ action: 'join', skin: chosen, team })}
                    >
                      <Plus size={17} /> Tham gia cuộc đua
                    </AsyncButton>
                    <span className="muted">Bạn đang xem với tư cách khán giả.</span>
                  </>
                )}
              </div>
            )}
            {manage && (
              <div className="duck-host-controls">
                <AsyncButton
                  variant="primary"
                  disabled={
                    state.pending ||
                    state.retry ||
                    race.entries.length < 2 ||
                    race.entries.some((e) => !e.ready)
                  }
                  onClick={() => state.send({ action: 'start' })}
                >
                  <Flag size={17} /> Khóa đội hình & xuất phát
                </AsyncButton>
                <div className="duck-actions">
                  <Button
                    onClick={() => setEditing(true)}
                    disabled={state.pending || state.retry || race.previousId !== null}
                  >
                    Cài đặt cuộc đua
                  </Button>
                  <AsyncButton
                    disabled={state.pending || state.retry}
                    onClick={() => state.send({ action: 'lobby', closed: !race.lobbyClosed })}
                  >
                    {race.lobbyClosed ? 'Mở sảnh' : 'Khóa sảnh'}
                  </AsyncButton>
                  <Confirm
                    title="Hủy cuộc đua?"
                    description="Chỉ có thể hủy trước khi khóa đội hình và xuất phát."
                    children={<Button variant="ghost">Hủy</Button>}
                    onConfirm={() => state.send({ action: 'cancel' })}
                  />
                </div>
              </div>
            )}
            <small className="muted">
              {race.previousId !== null && 'Đội hình và thể thức giải đấu đã khóa từ vòng đầu. '}
              Sau xuất phát, cuộc đua vẫn tiếp tục dù chủ cuộc đua đóng trình duyệt.
            </small>
          </section>
        </div>
      ) : cancelled ? (
        <Empty title="Cuộc đua đã hủy">Bạn có thể quay về danh sách để chọn cuộc đua khác.</Empty>
      ) : (
        <>
          <div
            className={'duck-stage' + (graphics.reducedMotion ? ' duck-reduced-motion' : '')}
            ref={stage}
          >
            <div className="duck-stage-top">
              <span className="duck-pill">
                {replay
                  ? '↺ PHÁT LẠI'
                  : buffering
                    ? 'ĐANG CHỜ DỮ LIỆU CUỘC ĐUA…'
                    : finished
                      ? '✦ VICTORY LANE'
                      : elapsed < 0
                        ? 'SẴN SÀNG XUẤT PHÁT'
                        : elapsed > race.config.duration * 800
                          ? 'NƯỚC RÚT!'
                          : 'LIVE RACE'}
                <small>
                  {Math.max(0, Math.min(race.config.duration, elapsed / 1000)).toFixed(1)} /{' '}
                  {race.config.duration}s
                </small>
              </span>
              <div className="duck-actions">
                <Button
                  size="icon"
                  aria-label={graphics.volume ? 'Tắt âm thanh game' : 'Bật âm thanh game'}
                  onClick={() => {
                    const volume = graphics.volume ? 0 : 0.35;
                    audio.setVolume(volume);
                    setGraphics((g) => ({ ...g, volume }));
                  }}
                >
                  {graphics.volume ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </Button>
                <Button
                  size="icon"
                  aria-label="Toàn màn hình cuộc đua"
                  onClick={async () => {
                    try {
                      if (document.fullscreenElement) await document.exitFullscreen();
                      else await stage.current?.requestFullscreen();
                    } catch {
                      toast.info('Trình duyệt chưa hỗ trợ toàn màn hình.');
                    }
                  }}
                >
                  <Maximize size={18} />
                </Button>
              </div>
            </div>
            {graphics.twoD ? (
              <div className="duck-flat-track" aria-label="Cuộc đua 2D">
                <span className="duck-flat-finish">🏁</span>
                {order.map((e, i) => (
                  <div
                    className={'duck-flat-lane' + (e.id === me?.id ? ' is-mine' : '')}
                    key={e.id}
                    data-entry={e.id}
                  >
                    <span>{e.name}</span>
                    <div>
                      <i style={{ left: `${Math.min(1, positions[i] ?? 0) * 92}%` }}>
                        <SkinBadge skin={e.skin} small />
                      </i>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Suspense fallback={<Loading>Đang dựng dòng sông…</Loading>}>
                <Scene
                  view={view}
                  mine={snapshot.me}
                  graphics={graphics}
                  camera={camera}
                  follow={follow}
                  onFailure={failGraphics}
                  onPerformance={performanceReport}
                />
              </Suspense>
            )}
            {!replay && elapsed < 0 && running && (
              <div className="duck-countdown" role="status">
                <span>
                  {Math.ceil(-elapsed / 1000) <= 3 ? Math.ceil(-elapsed / 1000) : 'Sẵn sàng?'}
                </span>
                <small>Cùng về đích nào!</small>
              </div>
            )}
            {(running || replay) && elapsed >= 0 && (
              <div
                className={
                  'duck-live-ranking' +
                  (showRanking ? '' : ' collapsed') +
                  (graphics.twoD ? ' is-flat' : '')
                }
              >
                <button
                  className="duck-ranking-toggle"
                  aria-expanded={showRanking}
                  aria-label={showRanking ? 'Ẩn bảng xếp hạng' : 'Hiện bảng xếp hạng'}
                  onClick={() => setShowRanking((v) => !v)}
                >
                  <span>
                    {showRanking ? 'DẪN ĐẦU' : `DẪN ĐẦU: ${leaderboard[0]?.entry.name ?? '—'}`}
                    {myPlace ? ` · Bạn #${myPlace}` : ''}
                  </span>
                  <span aria-hidden="true">{showRanking ? '−' : '+'}</span>
                </button>
                {showRanking &&
                  leaderboard.slice(0, 4).map((item, i) => (
                    <button
                      key={item.entry.id}
                      onClick={() => {
                        setFollow(item.entry.id);
                        setCamera('LEADER');
                      }}
                      aria-label={`Theo dõi ${item.entry.name}`}
                    >
                      <b>{i + 1}</b>
                      <SkinBadge skin={item.entry.skin} small />
                      <span>{item.entry.name}</span>
                    </button>
                  ))}
              </div>
            )}
            {finished && !replay && (
              <div className="duck-winner-banner">
                <span>NGÔI SAO CỦA DÒNG SÔNG</span>
                <strong>{race.entries.find((e) => e.id === race.results[0]?.entryId)?.name}</strong>
                <small>Về nhất · {((race.results[0]?.finishMs ?? 0) / 1000).toFixed(3)} giây</small>
              </div>
            )}
            <div className="duck-reaction-stream" aria-hidden="true">
              {state.reactions
                .filter((r) => Date.now() - r.at < 4500)
                .map((r, i) => (
                  <span key={r.id} style={{ left: `${15 + i * 6}%` }}>
                    {r.emoji}
                  </span>
                ))}
            </div>
            {graphics.fps && (
              <output className="duck-fps">
                {metrics.fps} FPS · {metrics.calls} draw calls
              </output>
            )}
            <div className="duck-stage-bottom">
              {!graphics.twoD && (
                <label className="duck-camera-label">
                  Góc máy
                  <select
                    aria-label="Góc máy"
                    value={camera}
                    onChange={(e) => {
                      setCamera(e.target.value as CameraMode);
                      setFollow('');
                    }}
                  >
                    {Object.entries(cameras).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {me && (
                <Button onClick={showMine}>
                  <span>🦆</span> Vịt của tôi{myPlace ? ` · #${myPlace}` : ''}
                </Button>
              )}
              <div className="duck-reactions" aria-label="Cổ vũ">
                {['🦆', '🔥', '👏', '💜', '🏁'].map((emoji) => (
                  <AsyncButton
                    key={emoji}
                    disabled={state.pending || state.retry}
                    aria-label={`Cổ vũ ${emoji}`}
                    onClick={async () => {
                      audio.play('quack');
                      await state.send({ action: 'reaction', emoji: emoji as '🦆' });
                    }}
                  >
                    {emoji}
                  </AsyncButton>
                ))}
              </div>
            </div>
          </div>
          {replay && (
            <div className="duck-replay-controls">
              <Button
                aria-label={replay.paused ? 'Tiếp tục phát lại' : 'Tạm dừng phát lại'}
                onClick={() => replayAt(elapsed, replay.speed, !replay.paused)}
              >
                {replay.paused ? <Play size={17} /> : <Pause size={17} />}
              </Button>
              <input
                aria-label="Vị trí phát lại"
                type="range"
                min={0}
                max={race.config.duration * 1000}
                step={10}
                value={Math.min(race.config.duration * 1000, Math.max(0, elapsed))}
                onChange={(e) => replayAt(Number(e.target.value), replay.speed, true)}
              />
              <select
                aria-label="Tốc độ phát lại"
                value={replay.speed}
                onChange={(e) => replayAt(elapsed, Number(e.target.value), replay.paused)}
              >
                {[0.25, 0.5, 1].map((n) => (
                  <option key={n} value={n}>
                    {n}×
                  </option>
                ))}
              </select>
              <Button onClick={() => setReplay(null)}>Về kết quả</Button>
            </div>
          )}
          {replay && camera === 'FINISH' && photoGap !== null && (
            <div className="duck-photo-finish" role="status">
              <Flag size={22} />
              <div>
                <strong>
                  {photoGap <= race.config.photoFinishMs
                    ? 'PHOTO FINISH · SÁT NÚT'
                    : 'XEM LẠI VẠCH ĐÍCH'}
                </strong>
                <p>
                  Hạng 1 và 2 cách nhau <b>{photoGap} ms</b>. Thứ hạng dùng thời điểm cán đích được
                  lưu trên server, không phụ thuộc tốc độ khung hình.
                </p>
              </div>
            </div>
          )}
          {nextRace && !replay && (
            <div className="duck-next-race" role="status">
              <span>
                <strong>Cuộc đua tiếp theo đã mở</strong>
                <small>
                  {nextRace.name} · {nextRace.count} vịt
                </small>
              </span>
              <Button variant="primary" onClick={() => open(nextRace.id)}>
                Vào cuộc đua <ChevronRight size={16} />
              </Button>
            </div>
          )}
          {race.status === 'FINISHED' && (finished || replay) && (
            <div className="duck-results-layout">
              <section className="duck-result-card">
                <div className="duck-section-title">
                  <h2>
                    <Trophy size={22} /> Bảng về đích
                  </h2>
                  <span>{race.results.length} vịt</span>
                </div>
                {race.results.map((r, i) => {
                  const e = race.entries.find((e) => e.id === r.entryId)!;
                  return (
                    <div key={r.entryId} className="duck-score-row">
                      <b>{r.rank === 1 ? '🏆' : r.rank}</b>
                      <SkinBadge skin={e.skin} small />
                      <span>
                        {e.name}
                        <small>
                          {e.requestedBy
                            ? `Đề cử bởi ${e.requestedBy}`
                            : e.team || skins[e.skin].name}
                        </small>
                      </span>
                      <strong>
                        {(r.finishMs / 1000).toFixed(3)}s
                        <small>
                          {i ? `+${r.finishMs - race.results[0].finishMs} ms` : 'Chiến thắng'}
                        </small>
                      </strong>
                    </div>
                  );
                })}
                <div className="duck-actions">
                  <Button onClick={() => replayAt(0)}>
                    <RotateCcw size={16} /> Xem lại
                  </Button>
                  <Button
                    onClick={() => {
                      setCamera('FINISH');
                      replayAt(Math.max(0, race.results[0].finishMs - 2500), 0.25);
                    }}
                  >
                    Photo finish
                    {photoGap !== null && photoGap <= race.config.photoFinishMs
                      ? ' · Sát nút!'
                      : ''}
                  </Button>
                  {manage && (
                    <AsyncButton
                      disabled={state.pending || state.retry}
                      onClick={async () =>
                        open((await state.send({ action: 'rematch', nextRound: false })).race!.id)
                      }
                    >
                      Đua lại
                    </AsyncButton>
                  )}
                  {manage && canNext && (
                    <AsyncButton
                      variant="primary"
                      disabled={state.pending || state.retry}
                      onClick={async () =>
                        open((await state.send({ action: 'rematch', nextRound: true })).race!.id)
                      }
                    >
                      Vòng kế tiếp <ChevronRight size={16} />
                    </AsyncButton>
                  )}
                </div>
                {race.config.rewards.enabled && (
                  <p className="duck-reward-note">
                    Coin đã được cộng vào ví ROOMTUNE theo cấu hình đã khóa. Phát lại không nhận
                    thêm coin.
                  </p>
                )}
                {race.songReward === 'PENDING' && (
                  <div className="notice">
                    Bài thắng đang chờ chủ phòng duyệt.
                    {snapshot.role === 'owner' && (
                      <AsyncButton onClick={() => state.send({ action: 'approve_song' })}>
                        Đưa bài thắng lên đầu
                      </AsyncButton>
                    )}
                  </div>
                )}
                {race.songReward === 'APPLIED' && (
                  <p className="duck-reward-note">♫ Bài thắng đã được ưu tiên đầu hàng chờ.</p>
                )}
                {race.songReward === 'SKIPPED_UNAVAILABLE' && (
                  <p className="muted">Bài thắng không còn chờ nên hàng nhạc được giữ nguyên.</p>
                )}
              </section>
              <section className="duck-proof-card">
                <ShieldCheck size={28} />
                <h3>Kết quả có thể kiểm chứng</h3>
                <p>
                  Đối chiếu hạt giống đã công bố với cam kết trước xuất phát và thứ hạng được lưu.
                </p>
                <AsyncButton onClick={verify} loading={proof === 'checking'}>
                  Kiểm chứng cuộc đua
                </AsyncButton>
                <p role="status">
                  {proof === 'valid'
                    ? '✓ Cam kết, đội hình và thứ hạng đều khớp.'
                    : proof === 'invalid'
                      ? 'Không thể xác minh. Hãy tải lại dữ liệu và kiểm tra lại.'
                      : ''}
                </p>
                <details>
                  <summary>Xem bằng chứng</summary>
                  <small>SHA-256 commitment</small>
                  <code>{race.commitment}</code>
                  <small>Hạt giống đã công bố</small>
                  <code>{race.seed}</code>
                  <small>Đội hình đã khóa</small>
                  <code>{race.lockedHash}</code>
                  <Button
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(race, null, 2)], {
                        type: 'application/json',
                      });
                      const url = URL.createObjectURL(blob),
                        link = document.createElement('a');
                      link.href = url;
                      link.download = `roomtune-duck-${race.id}.json`;
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    Lưu bằng chứng
                  </Button>
                </details>
              </section>
            </div>
          )}
        </>
      )}
      {race.config.tournament.kind !== 'SINGLE' && (
        <section className="duck-tournament">
          <div className="duck-section-title">
            <h3>
              Hành trình giải đấu{race.config.tournament.kind === 'TEAM' ? ' · Xếp hạng đội' : ''}
            </h3>
            <span>
              {tournamentDone
                ? 'Đã kết thúc'
                : `Vòng ${race.round}/${race.config.tournament.rounds}`}
            </span>
          </div>
          {tournamentDone && (
            <div className="duck-tournament-champion" role="status">
              <Trophy size={28} />
              <div>
                <small>{champions.length > 1 ? 'Đồng vô địch' : 'Vô địch giải đấu'}</small>
                <strong>{champions.join(' · ')}</strong>
              </div>
            </div>
          )}
          <div className="duck-rounds">
            {Array.from({ length: race.config.tournament.rounds }, (_, i) => {
              const round = data.rounds.find((r) => r.round === i + 1);
              return round ? (
                <button
                  key={i}
                  type="button"
                  className={
                    round.id === race.id ? 'current' : round.status === 'FINISHED' ? 'done' : ''
                  }
                  aria-current={round.id === race.id ? 'step' : undefined}
                  onClick={() => open(round.id)}
                >
                  {round.status === 'FINISHED' ? '✓' : i + 1}
                  <small>
                    Vòng {i + 1} · {round.count} vịt
                  </small>
                  <small>
                    {round.id === race.id && !revealed
                      ? statusNames.RACING
                      : (round.winner ?? statusNames[round.status])}
                  </small>
                </button>
              ) : (
                <span key={i}>
                  <b>{i + 1}</b>
                  <small>{tournamentDone ? 'Không cần thi đấu' : 'Chưa bắt đầu'}</small>
                </span>
              );
            })}
          </div>
          <p className="muted">
            {race.config.tournament.kind === 'ELIMINATION'
              ? 'Vô địch là vịt về nhất vòng cuối. Bên dưới là điểm tích lũy để tham khảo.'
              : 'Xếp hạng theo tổng điểm, sau đó số lần về nhất. Bằng cả hai thì đồng hạng.'}
          </p>
          {!revealed && <p className="muted">Bảng điểm cập nhật khi các chú vịt về đích.</p>}
          {(revealed ? data.standings : []).map((e) => (
            <div className="duck-score-row" key={e.entryId}>
              <b>
                {data.standings.findIndex((p) => p.points === e.points && p.wins === e.wins) + 1}
              </b>
              <span>
                {e.name}
                <small>{e.wins} lần về nhất</small>
              </span>
              <strong>{e.points} điểm</strong>
            </div>
          ))}
        </section>
      )}
      {manage && (
        <details className="duck-management">
          <summary>Quản lý quyền điều khiển</summary>
          <label>
            Chuyển chủ cuộc đua
            <select
              aria-label="Chuyển chủ cuộc đua"
              value={race.host}
              disabled={state.pending || state.retry}
              onChange={(e) => {
                const target = snapshot.members.find((m) => m.user_id === e.target.value);
                if (
                  !window.confirm(
                    `Chuyển quyền điều khiển cuộc đua cho ${target?.name ?? 'thành viên này'}? Bạn sẽ không thể tự lấy lại nếu không phải chủ phòng.`,
                  )
                ) {
                  e.target.value = race.host;
                  return;
                }
                void state.send({ action: 'transfer', user: e.target.value }).catch(() => {});
              }}
            >
              {snapshot.members
                .filter((m) => !race.banned.includes(m.user_id))
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <small>
            Quyền này chỉ điều khiển cuộc đua; chủ phòng luôn có quyền quản lý. Đường đua và kết quả
            đã khóa được giữ nguyên.
          </small>
        </details>
      )}
      <Modal
        title="Phong cách của bạn"
        description="Mọi chú vịt đều có cùng cơ hội chiến thắng."
        open={picker}
        onOpenChange={setPicker}
        className="duck-skin-dialog"
      >
        <div className="duck-skin-grid">
          {duckSkins.map((skin) => (
            <button
              key={skin}
              aria-label={skins[skin].name}
              aria-pressed={chosen === skin}
              onClick={() => setChosen(skin)}
            >
              <SkinBadge skin={skin} />
              <strong>{skins[skin].name}</strong>
            </button>
          ))}
        </div>
        <AsyncButton
          variant="primary"
          onClick={async () => {
            if (me) await state.send({ action: 'skin', skin: chosen });
            setPicker(false);
          }}
        >
          Chọn phong cách này
        </AsyncButton>
      </Modal>
      <Modal
        title="Cài đặt cuộc đua"
        description="Thay đổi trước khi đội hình được khóa. Thành viên cần sẵn sàng lại sau khi đổi."
        open={editing}
        onOpenChange={setEditing}
        className="duck-wide-dialog"
      >
        <RaceForm
          snapshot={snapshot}
          race={race}
          settings={data.settings}
          presets={data.presets}
          send={state.send}
          done={() => setEditing(false)}
        />
      </Modal>
      <Modal
        title="Hẹn nhau bên dòng sông"
        description="Quét QR, vào phòng và cùng cổ vũ."
        open={invite}
        onOpenChange={setInvite}
      >
        <div className="duck-qr">
          <QRCodeSVG value={share} size={220} marginSize={3} />
          <strong>{snapshot.room.code}</strong>
          <p>{race.name}</p>
          <AsyncButton
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(share);
                toast.success('Đã sao chép lời mời.');
              } catch {
                toast.error('Chưa thể sao chép. Bạn có thể chọn liên kết bên dưới.');
              }
            }}
          >
            <Copy size={16} /> Sao chép lời mời
          </AsyncButton>
          <input
            readOnly
            aria-label="Liên kết cuộc đua"
            value={share}
            onFocus={(e) => e.target.select()}
          />
        </div>
      </Modal>
      <Modal
        title="Hình ảnh & âm thanh"
        description="Cài đặt riêng cho thiết bị này, không thay đổi nhạc của phòng."
        open={settings}
        onOpenChange={setSettings}
      >
        <div className="duck-form">
          <label>
            Chất lượng
            <select
              aria-label="Chất lượng"
              value={graphics.quality}
              onChange={(e) => {
                slow.current = 0;
                setGraphics((g) => ({ ...g, quality: e.target.value as typeof g.quality }));
              }}
            >
              <option value="LOW">Nhẹ — ít hiệu ứng</option>
              <option value="MEDIUM">Cân bằng</option>
              <option value="HIGH">Đẹp — bóng chi tiết hơn</option>
            </select>
          </label>
          <label>
            Độ phân giải
            <select
              aria-label="Độ phân giải"
              value={graphics.resolution}
              onChange={(e) => setGraphics((g) => ({ ...g, resolution: Number(e.target.value) }))}
            >
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
              <option value={1.5}>150%</option>
              <option value={2}>200% — sắc nét hơn</option>
            </select>
          </label>
          {(
            [
              ['shadows', 'Bóng đổ'],
              ['particles', 'Gợn sóng & pháo giấy'],
              ['reducedMotion', 'Giảm chuyển động'],
              ['fps', 'Hiện hiệu năng'],
              ['autoQuality', 'Tự giảm chất lượng khi máy chậm'],
              ['twoD', 'Xem cuộc đua 2D'],
            ] as const
          ).map(([key, label]) => (
            <label className="duck-check" key={key}>
              <input
                type="checkbox"
                checked={graphics[key]}
                onChange={(e) => setGraphics((g) => ({ ...g, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
          <label>
            Âm thanh game · {Math.round(graphics.volume * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={graphics.volume}
              onChange={(e) => {
                const volume = Number(e.target.value);
                audio.setVolume(volume);
                setGraphics((g) => ({ ...g, volume }));
                audio.play('click');
              }}
            />
          </label>
          <p className="muted">
            Kéo chuột để xoay và cuộn để zoom ở góc máy Tự do. 2D hỗ trợ điện thoại và thiết bị
            không có WebGL.
          </p>
        </div>
      </Modal>
    </>
  );
}

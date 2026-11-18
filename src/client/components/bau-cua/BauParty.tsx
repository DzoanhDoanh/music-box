import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Coins,
  Crown,
  History,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Snapshot } from '../../../shared/contracts';
import {
  phaseNames,
  symbols,
  symbolIcons,
  symbolNames,
  type BauRound,
  type BauSnapshot,
} from '../../../shared/bau-cua/contracts';
import { verifyRound } from '../../../shared/bau-cua/fairness';
import { useBauCua } from '../../lib/bau-cua';
import { AsyncButton, Button, Confirm, ErrorState, Loading, Modal } from '../ui';
import BauSettings from './BauSettings';
import BauBets from './BauBets';
import BauCoinGrant from './BauCoinGrant';
import { symbolArtwork } from './artwork';
import { api } from '../../lib/api';
import { BauLeaderboard, BauResult } from './BauSummary';
import { roundStandings } from '../../../shared/bau-cua/summary';
import '../game/game.css';
import './bau-cua.css';

const Scene = lazy(() => import('./BauScene'));
const money = (n: number) => n.toLocaleString('vi-VN');
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Fairness({
  round,
  showCommitment,
  showVerification,
}: {
  round: BauRound;
  showCommitment: boolean;
  showVerification: boolean;
}) {
  const [verified, setVerified] = useState<boolean | null>(null);
  return (
    <div className="bau-fairness">
      <p>
        Seed đã được cam kết trước khi nhận cược.
        {showVerification && ' Việc kiểm tra chạy ngay trên thiết bị của bạn.'}
      </p>
      <dl>
        <dt>Mã vòng</dt>
        <dd>{round.id}</dd>
        {showCommitment && (
          <>
            <dt>SHA-256 cam kết</dt>
            <dd>{round.commitment}</dd>
          </>
        )}
        {showVerification && (
          <>
            <dt>Seed đã công bố</dt>
            <dd>{round.revealed_seed ?? 'Chưa mở bát — seed vẫn được giữ bí mật.'}</dd>
          </>
        )}
        <dt>Ba mặt</dt>
        <dd>{round.dice?.map((n) => symbolNames[symbols[n]]).join(' · ') ?? 'Chưa công bố'}</dd>
      </dl>
      {showVerification && (
        <AsyncButton
          disabled={!round.revealed_seed || !round.dice}
          onClick={async () => {
            try {
              setVerified(
                await verifyRound(round.id, round.revealed_seed!, round.commitment, round.dice!),
              );
            } catch {
              setVerified(false);
            }
          }}
        >
          <ShieldCheck size={17} />
          Kiểm tra lại kết quả
        </AsyncButton>
      )}
      {showVerification && verified !== null && (
        <p role="status" className={verified ? 'bau-positive' : 'bau-negative'}>
          {verified
            ? 'Khớp cam kết và cả ba mặt xúc xắc.'
            : 'Kết quả không khớp. Giữ mã vòng và báo chủ phòng.'}
        </p>
      )}
      {showVerification && (
        <details>
          <summary>Thuật toán công khai</summary>
          <p>
            SHA-256 UTF-8 seed tạo commitment. Chuỗi ROOMTUNE:BAU_CUA:v1:mã-vòng:seed:counter bắt
            đầu counter=0, băm SHA-256; đọc byte, bỏ giá trị từ 252 trở lên, lấy phần dư chia 6 cho
            đến đủ ba mặt. Thứ tự: Bầu, Cua, Tôm, Cá, Gà, Nai.
          </p>
          <p>
            Cam kết chứng minh seed không đổi sau công bố; không chứng minh nhà vận hành không biết
            seed.
          </p>
        </details>
      )}
    </div>
  );
}
function Rules({ data }: { data: BauSnapshot }) {
  const rules = data.round?.settings ?? data.settings;
  return (
    <div className="bau-guide">
      <p>Coin chỉ dùng giải trí, không nạp/rút, không mua bán hoặc quy đổi.</p>
      <ol>
        <li>
          Chọn chip rồi bấm Bầu, Cua, Tôm, Cá, Gà hoặc Nai. Có thể chọn nhiều ô trước lúc khóa.
        </li>
        <li>
          Không có mặt đã cược: mất số coin đó. Có 1/2/3 mặt: nhận lại 2/3/4 lần số coin, đã gồm
          vốn.
        </li>
        <li>
          Cái không đặt cược; hệ thống khóa đúng quỹ đủ chi trả cho mọi kết quả. Không ai chọn được
          mặt xúc xắc.
        </li>
        <li>
          Ra khỏi bàn không hủy cược đã nhận. Mất mạng, tải lại hoặc nhiều tab không nhận thêm coin.
        </li>
      </ol>
      <h3>Luật {data.round ? 'của vòng hiện tại' : 'phòng đang dùng'}</h3>
      <p>
        Tối thiểu {money(rules.minBet)}, tối đa {money(rules.maxBet)} mỗi lần; mỗi người tối đa{' '}
        {money(rules.playerLimit)} một vòng. Đặt cược trong {rules.bettingSeconds} giây.
      </p>
      <p className="bau-warning">
        {rules.penaltyEnabled
          ? `Hết coin theo ngưỡng ${rules.penaltyTrigger === 'ZERO' ? 'tổng ví bằng 0' : 'dưới ' + money(rules.minBet)}: gỡ tối đa ${rules.penaltyCount} bài đang chờ mới nhất của chính người đó trong phòng. ${rules.penaltyPlayers ? 'Áp dụng người chơi. ' : ''}${rules.penaltyDealer ? 'Áp dụng người cầm cái.' : ''}`
          : 'Phòng đang tắt hình phạt nhạc.'}{' '}
        Bài đang phát và thư viện cá nhân luôn được giữ nguyên.
      </p>
      <p>
        Hình phạt được xử lý trước cứu trợ, không gỡ bài thêm sau này và không lặp khi tải lại. Chủ
        phòng có thể khôi phục bài bằng thao tác có ghi nhật ký.
      </p>
    </div>
  );
}
function RecentRounds({
  data,
  onFairness,
}: {
  data: BauSnapshot;
  onFairness: (r: BauRound) => void;
}) {
  return (
    <div className="bau-history">
      {data.history.length === 0 ? (
        <p>Chưa có vòng đã kết thúc được công bố.</p>
      ) : (
        data.history.map((r) => {
          const standings = roundStandings(
            r,
            Object.fromEntries(data.members.map((m) => [m.user_id, m.name])),
          );
          return (
            <article key={r.id}>
              <div className="bau-row">
                <strong>Vòng {r.number}</strong>
                <span>
                  {r.status === 'CANCELLED'
                    ? 'Đã hoàn cược'
                    : r.dice?.map((n) => symbolIcons[symbols[n]]).join(' ')}
                </span>
                {data.settings.showVerification && (
                  <Button onClick={() => onFairness(r)}>
                    <ShieldCheck size={15} />
                    Xác minh
                  </Button>
                )}
              </div>
              <ol>
                {standings.map((p) => (
                  <li key={p.user}>
                    <span>
                      {p.name}
                      {p.net > 0 && <small>{p.awards.join(' · ')}</small>}
                    </span>
                    <b className={p.net >= 0 ? 'bau-positive' : 'bau-negative'}>
                      {p.net > 0 ? '+' : ''}
                      {money(p.net)}
                    </b>
                  </li>
                ))}
              </ol>
              <small>
                Cái:{' '}
                {r.dealer_net === null
                  ? 'Hoàn tiền'
                  : (r.dealer_net > 0 ? '+' : '') + money(r.dealer_net)}{' '}
                coin
              </small>
            </article>
          );
        })
      )}
    </div>
  );
}

export default function BauParty({
  snapshot,
  table,
}: {
  snapshot: Snapshot;
  table: string | null;
}) {
  const room = snapshot.room.id,
    actor = snapshot.me,
    navigate = useNavigate();
  const game = useBauCua(room, actor, table),
    data = game.data;
  const [dialog, setDialog] = useState<
      'rules' | 'settings' | 'wallet' | 'history' | 'members' | 'fairness' | 'grant' | null
    >(null),
    [fairRound, setFairRound] = useState<BauRound | null>(null);
  const [name, setName] = useState('Bầu cua cùng nhau'),
    [creating, setCreating] = useState(false),
    [chip, setChip] = useState(100),
    [custom, setCustom] = useState('100');
  const [low, setLow] = useState(() => {
      try {
        return localStorage.getItem('roomtune:bau:low') === 'true';
      } catch {
        return false;
      }
    }),
    [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    [skip, setSkip] = useState(false);
  const [clock, setClock] = useState(Date.now()),
    [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null),
    lastSound = useRef('');
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)'),
      change = () => setReduced(m.matches);
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, []);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  useEffect(() => {
    const r = data?.round;
    if (!r || r.status !== 'RESULT' || lastSound.current === r.id) return;
    lastSound.current = r.id;
    if (sound && audio.current?.state === 'running') {
      const a = audio.current,
        o = a.createOscillator(),
        g = a.createGain();
      o.frequency.value = 523;
      g.gain.setValueAtTime(0.025, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.3);
      o.connect(g);
      g.connect(a.destination);
      o.start();
      o.stop(a.currentTime + 0.32);
    }
  }, [data?.round, sound]);
  const persistLow = (value: boolean) => {
    setLow(value);
    try {
      localStorage.setItem('roomtune:bau:low', String(value));
    } catch {
      /* Device preference is optional. */
    }
  };
  const showFairness = (r: BauRound) => {
    setFairRound(r);
    setDialog('fairness');
  };
  const send = game.send;
  if (!data)
    return game.query.error ? (
      <ErrorState error={game.query.error} retry={() => void game.query.refetch()} />
    ) : (
      <Loading />
    );
  const r = data.round,
    m = data.table,
    settings = r?.settings ?? data.settings;
  const me = data.members.find((p) => p.user_id === actor),
    dealer = data.members.find((p) => p.user_id === m?.dealer_id);
  const busy = game.pending || game.retry || !!game.query.error;
  const seconds = r?.deadline
    ? Math.max(0, Math.ceil((Date.parse(r.deadline) - clock - game.offset.current) / 1000))
    : null;
  const active = !!r && !['RESULT', 'CANCELLED'].includes(r.status);
  const canBet =
    !!me &&
    !me.spectator &&
    !me.banned &&
    m?.dealer_id !== actor &&
    r?.status === 'BETTING_OPEN' &&
    (seconds ?? 0) > 0;
  const personal =
    r?.bets.filter((b) => b.user_id === actor).reduce((n, b) => n + b.amount, 0) ?? 0;
  const isDealer = m?.dealer_id === actor;
  const dealerActionReady =
    !!r?.action_at && clock + game.offset.current >= Date.parse(r.action_at);
  const outcome = (
    <div className="bau-results" aria-label="Kết quả ba viên xúc xắc" aria-live="polite">
      {[0, 1, 2].map((i) => (
        <span key={i}>
          {r?.dice ? (
            <>
              <img src={symbolArtwork[symbols[r.dice[i]]]} alt="" width={28} height={30} />
              <small>{symbolNames[symbols[r.dice[i]]]}</small>
            </>
          ) : (
            <>
              <b>?</b>
              <small>Chưa mở</small>
            </>
          )}
        </span>
      ))}
    </div>
  );
  const graphicsFallback = (
    <div
      className={
        'bau-bowl-2d ' + (r?.status === 'SHAKING' && !reduced && !skip ? 'bau-shaking' : '')
      }
    >
      <span>{r?.dice ? '✨' : '🥣'}</span>
      <small>{r?.dice ? 'Kết quả đã xác nhận' : 'Ba viên đang được giữ kín'}</small>
    </div>
  );
  return (
    <section className="bau-party" aria-label="Bầu Cua Party">
      <header className="bau-header">
        <div>
          <span className="bau-eyebrow">
            <Sparkles size={14} /> ROOMTUNE PARTY
          </span>
          <h1>
            {m?.name ?? 'Bầu Cua Party'}
            <span>.</span>
          </h1>
          <p>Chung một bàn. Thêm một chút may mắn.</p>
        </div>
        <div className="bau-header-actions">
          <Button asChild>
            <Link to={`/room/${room}/games${table ? '/bau-cua' : ''}`}>
              <ArrowLeft size={17} />
              {table ? 'Danh sách bàn' : 'Trò chơi'}
            </Link>
          </Button>
          <Button onClick={() => setDialog('rules')} aria-label="Luật Bầu Cua">
            <BookOpen size={18} />
            <span>Luật chơi</span>
          </Button>
          {(snapshot.role === 'owner' || data.systemAdmin) && (
            <Button onClick={() => setDialog('settings')} aria-label="Cài đặt Bầu Cua">
              <Settings size={18} />
            </Button>
          )}
          {data.systemAdmin && (
            <Button onClick={() => setDialog('grant')}>
              <Coins size={18} aria-hidden="true" />
              Cấp coin
            </Button>
          )}
        </div>
      </header>
      {game.query.error && (
        <div className="bau-warning" role="status">
          Đang kết nối lại. Chưa thể nhận thêm thao tác; số coin hiển thị là lần xác nhận gần nhất.
        </div>
      )}
      {game.retry && (
        <div className="bau-warning" role="status">
          Một thao tác chưa nhận được xác nhận.{' '}
          <AsyncButton onClick={() => send()}>Xác minh thao tác trước</AsyncButton>
        </div>
      )}
      <div className="bau-wallet-strip">
        <button onClick={() => setDialog('wallet')}>
          <Coins size={24} />
          <span>
            Ví của bạn
            <strong>
              {money(data.wallet.available)} <small>coin khả dụng</small>
            </strong>
          </span>
        </button>
        <span>
          Đang khóa <b>{money(data.wallet.reserved)}</b>
        </span>
        <span>
          Tổng <b>{money(data.wallet.total)}</b>
        </span>
        <small>Coin ảo · Không quy đổi</small>
      </div>
      {!table ? (
        <>
          <div className="bau-lobby-hero">
            <div className="bau-hero-icons">
              {symbols.map((s) => (
                <span key={s}>{symbolIcons[s]}</span>
              ))}
            </div>
            <div>
              <h2>Mở bàn, gọi bạn, cùng mở bát.</h2>
              <p>
                Mỗi danh tính nhận coin một lần. Chọn làm cái hoặc thử vận may ở sáu biểu tượng.
              </p>
              <Button
                variant="primary"
                disabled={!data.settings.enabled || busy}
                onClick={() => setCreating(true)}
              >
                <Plus size={18} />
                Tạo bàn Bầu Cua
              </Button>
            </div>
          </div>
          <div className="bau-warning">
            {data.settings.penaltyEnabled
              ? `Luật phòng: hết coin có thể gỡ ${data.settings.penaltyCount} bài mới nhất của bạn đang chờ phát. `
              : 'Phòng đang tắt hình phạt nhạc. '}
            <button onClick={() => setDialog('rules')}>Xem luật trước khi chơi</button>
          </div>
          {!data.settings.enabled && (
            <p role="status">Chủ phòng đang tắt tạo bàn và tham gia mới.</p>
          )}
          <div className="bau-table-list">
            {data.tables.length === 0 ? (
              <div className="bau-empty">
                <Users size={32} />
                <h3>Bàn đầu tiên đang chờ bạn</h3>
                <p>Tạo bàn và gửi lời mời qua chat của phòng.</p>
              </div>
            ) : (
              data.tables.map((t) => (
                <article key={t.id}>
                  <span className="bau-table-art">🥣</span>
                  <span className="bau-status">{phaseNames[t.status]}</span>
                  <h3>{t.name}</h3>
                  <p>
                    <Users size={15} />
                    {t.members}/{data.settings.capacity} người chơi
                  </p>
                  <AsyncButton
                    variant="primary"
                    onClick={async () => {
                      if (!data.settings.spectators) {
                        try {
                          await api(
                            `/rooms/${room}/bau-cua/${t.id}`,
                            { action: 'join', spectator: false },
                            crypto.randomUUID(),
                            actor,
                          );
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Chưa thể vào bàn.');
                          return;
                        }
                      }
                      navigate(`/room/${room}/games/bau-cua/${t.id}`);
                    }}
                  >
                    Mở bàn
                  </AsyncButton>
                </article>
              ))
            )}
          </div>
        </>
      ) : m?.closed ? (
        <div className="bau-empty">
          <h2>Bàn đã đóng</h2>
          <p>Lịch sử và sổ coin vẫn được lưu.</p>
          <Button onClick={() => navigate(`/room/${room}/games/bau-cua`)}>Chọn bàn khác</Button>
        </div>
      ) : (
        m && (
          <>
            <div className="bau-table-meta">
              <span className="bau-status">
                <i className={game.connection === 'Đã kết nối' ? 'online' : ''} />
                {game.connection}
              </span>
              <button onClick={() => setDialog('members')}>
                <Users size={16} />
                {data.members.filter((p) => p.online && !p.banned).length} đang online
              </button>
              <Button onClick={() => setDialog('history')}>
                <History size={16} />
                Lịch sử vòng
              </Button>
              <AsyncButton
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(location.href);
                    toast.success('Đã sao chép lời mời vào bàn.');
                  } catch {
                    toast.error('Không sao chép được liên kết.');
                  }
                }}
              >
                Mời bạn
              </AsyncButton>
            </div>
            <div className="bau-arena">
              <div className="bau-play">
                <div className="bau-round-heading">
                  <div>
                    <span className="bau-eyebrow">VÒNG {r?.number ?? '—'}</span>
                    <h2>
                      {m.status === 'WAITING_FOR_DEALER' && m.dealer_id
                        ? 'Sẵn sàng vòng mới'
                        : phaseNames[m.status]}
                    </h2>
                  </div>
                  <span className={'bau-countdown ' + ((seconds ?? 100) < 6 ? 'urgent' : '')}>
                    {seconds === null ? '—' : seconds}
                    <small>{seconds === null ? 'Sẵn sàng' : 'giây'}</small>
                  </span>
                </div>
                {(isDealer || data.canManage) && (
                  <div className="bau-mobile-dealer">
                    {!active && (
                      <AsyncButton
                        variant="primary"
                        disabled={
                          busy || m.status === 'PAUSED' || !m.dealer_id || (seconds ?? 0) > 0
                        }
                        onClick={() => send({ action: 'start' })}
                      >
                        Sẵn sàng · Mở vòng
                      </AsyncButton>
                    )}
                    {isDealer && m.status === 'BETTING_LOCKED' && (
                      <AsyncButton
                        variant="primary"
                        disabled={busy || !dealerActionReady}
                        onClick={() => send({ action: 'shake' })}
                      >
                        Lắc bát
                      </AsyncButton>
                    )}
                    {isDealer && m.status === 'SHAKING' && (
                      <AsyncButton
                        variant="primary"
                        disabled={busy || !dealerActionReady}
                        onClick={() => send({ action: 'reveal' })}
                      >
                        Mở bát
                      </AsyncButton>
                    )}
                  </div>
                )}
                <div className="bau-stage">
                  {low ? (
                    graphicsFallback
                  ) : (
                    <SceneBoundary fallback={graphicsFallback}>
                      <Suspense fallback={graphicsFallback}>
                        <Scene
                          dice={r?.dice ?? null}
                          phase={r?.status ?? m.status}
                          reduced={reduced || skip}
                        />
                      </Suspense>
                    </SceneBoundary>
                  )}
                  {outcome}
                </div>
                <div className="bau-visual-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={low}
                      onChange={(e) => persistLow(e.target.checked)}
                    />
                    Đồ họa nhẹ
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={skip}
                      onChange={(e) => setSkip(e.target.checked)}
                    />
                    Bỏ hiệu ứng
                  </label>
                  <Button
                    size="icon"
                    aria-label={sound ? 'Tắt âm thanh game' : 'Bật âm thanh game'}
                    onClick={async () => {
                      if (!sound) {
                        try {
                          audio.current ??= new AudioContext();
                          await audio.current.resume();
                        } catch {
                          toast.error('Thiết bị chưa cho phép âm thanh.');
                          return;
                        }
                      }
                      setSound(!sound);
                    }}
                  >
                    {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                  </Button>
                  {r &&
                    (data.settings.showCommitment ||
                      (data.settings.showVerification && r.revealed_seed)) && (
                      <Button onClick={() => showFairness(r)}>
                        <ShieldCheck size={16} />
                        Cam kết
                      </Button>
                    )}
                </div>
                {!me || me.spectator ? (
                  <div className="bau-join">
                    <p>
                      {me
                        ? 'Bạn đang xem. Tham gia để đặt cược hoặc đăng ký làm cái.'
                        : 'Chọn tham gia bàn hoặc ngồi xem trước.'}
                    </p>
                    <AsyncButton
                      variant="primary"
                      disabled={busy || !data.settings.enabled}
                      onClick={() => send({ action: 'join', spectator: false })}
                    >
                      Tham gia chơi
                    </AsyncButton>
                    {!me && data.settings.spectators && (
                      <AsyncButton
                        disabled={busy}
                        onClick={() => send({ action: 'join', spectator: true })}
                      >
                        Ngồi xem
                      </AsyncButton>
                    )}
                  </div>
                ) : (
                  <div className="bau-chip-picker" aria-label="Chọn mức coin">
                    <span>Chọn chip</span>
                    {[100, 500, 1000].map((n) => (
                      <button
                        key={n}
                        aria-pressed={chip === n}
                        onClick={() => setChip(n)}
                        className={chip === n ? 'selected' : ''}
                      >
                        {money(n)}
                      </button>
                    ))}
                    {settings.customStake && (
                      <label>
                        <span className="sr-only">Coin tùy chọn</span>
                        <input
                          type="number"
                          value={custom}
                          min={settings.minBet}
                          max={settings.maxBet}
                          onChange={(e) => {
                            setCustom(e.target.value);
                            const n = Number(e.target.value);
                            setChip(Number.isSafeInteger(n) && n > 0 ? n : 0);
                          }}
                          aria-label="Coin tùy chọn"
                        />
                      </label>
                    )}
                    <small>Đã đặt: {money(personal)}</small>
                  </div>
                )}
                <div className="bau-betting-grid">
                  {symbols.map((s, index) => {
                    const bets = r?.bets.filter((b) => b.symbol === s) ?? [],
                      mine = bets.find((b) => b.user_id === actor)?.amount ?? 0,
                      total = bets.reduce((n, b) => n + b.amount, 0),
                      wins = r?.dice?.filter((n) => n === index).length ?? 0;
                    return (
                      <div
                        key={s}
                        role="group"
                        aria-label={`Ô ${symbolNames[s]}`}
                        className={'bau-bet-card' + (mine ? ' has-bet' : '') + (wins ? ' won' : '')}
                      >
                        <AsyncButton
                          className="bau-symbol-button"
                          disabled={
                            busy ||
                            !canBet ||
                            chip > data.wallet.available ||
                            chip < settings.minBet ||
                            chip > settings.maxBet
                          }
                          onClick={() =>
                            send({ action: 'bet', round: r!.id, symbol: s, amount: chip })
                          }
                          aria-label={`Đặt ${money(chip)} coin vào ${symbolNames[s]}`}
                        >
                          <img
                            className="bau-symbol"
                            src={symbolArtwork[s]}
                            alt=""
                            width={48}
                            height={51}
                          />
                          <strong>{symbolNames[s]}</strong>
                          <span className="bau-symbol-total">Cả bàn {money(total)}</span>
                          {wins > 0 && <em>×{wins}</em>}
                        </AsyncButton>
                        <div className="bau-my-stake">
                          <span>
                            Của bạn <b>{money(mine)}</b>
                          </span>
                          {mine > 0 && settings.undoBet && canBet && (
                            <AsyncButton
                              disabled={busy}
                              onClick={() => send({ action: 'undo', round: r!.id, symbol: s })}
                              aria-label={`Hoàn cược ${symbolNames[s]}`}
                            >
                              Hoàn
                            </AsyncButton>
                          )}
                        </div>
                        <BauBets bets={bets} symbol={s} actor={actor} />
                      </div>
                    );
                  })}
                </div>
                <p className="bau-bet-hint">
                  {isDealer
                    ? 'Bạn đang cầm cái; không đặt cược trong vòng của mình.'
                    : canBet
                      ? `Bấm biểu tượng để đặt ${money(chip)} coin. Chờ thông báo nhận cược trước khi đặt tiếp.`
                      : active
                        ? 'Đã khóa cược. Hệ thống tiếp tục vòng kể cả khi người cầm cái mất mạng.'
                        : 'Đợi người cầm cái mở vòng mới.'}
                </p>
                <BauResult data={data} actor={actor} />
                {settings.penaltyEnabled && (
                  <p
                    className={
                      'bau-penalty-note ' +
                      (data.wallet.total < settings.minBet * 3 ? 'near-empty' : '')
                    }
                  >
                    Luật vòng:{' '}
                    {settings.penaltyTrigger === 'ZERO'
                      ? 'hết tổng coin'
                      : 'tổng coin dưới ' + money(settings.minBet)}{' '}
                    có thể gỡ tối đa {settings.penaltyCount} bài của bạn đang chờ.{' '}
                    <button onClick={() => setDialog('rules')}>Chi tiết</button>
                  </p>
                )}
              </div>
              <aside className="bau-side">
                <section className="bau-dealer">
                  <div className="bau-dealer-heading">
                    <span className="bau-crown">
                      <Crown size={25} />
                    </span>
                    <div>
                      <span className="bau-eyebrow">NGƯỜI CẦM CÁI</span>
                      <h3>{dealer?.name ?? 'Ghế đang trống'}</h3>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Coin khả dụng của cái</dt>
                      <dd>{money(data.dealerAvailable ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>Quỹ đang khóa</dt>
                      <dd>{money(active ? (r?.collateral ?? 0) : 0)}</dd>
                    </div>
                    <div>
                      <dt>Vòng liên tiếp</dt>
                      <dd>
                        {m.dealer_rounds}/{data.settings.dealerRounds}
                      </dd>
                    </div>
                    <div>
                      <dt>Tổng cược</dt>
                      <dd>{money(r?.stake_total ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>Người đặt cược</dt>
                      <dd>{new Set(r?.bets.map((b) => b.user_id)).size}</dd>
                    </div>
                  </dl>
                  <span className="bau-guarantee">
                    <ShieldCheck size={15} />
                    {data.diagnostics.collateralSafe
                      ? 'Quỹ bảo đảm đủ cho mọi kết quả'
                      : 'Đang kiểm tra quỹ bảo đảm'}
                  </span>
                  {isDealer || data.canManage ? (
                    <div className="bau-dealer-actions">
                      <AsyncButton
                        className="bau-primary-action"
                        variant="primary"
                        disabled={
                          busy ||
                          active ||
                          m.status === 'PAUSED' ||
                          !m.dealer_id ||
                          (seconds ?? 0) > 0
                        }
                        onClick={() => send({ action: 'start' })}
                      >
                        Sẵn sàng · Mở vòng
                      </AsyncButton>
                      {isDealer && (
                        <>
                          <AsyncButton
                            className="bau-primary-action"
                            disabled={busy || m.status !== 'BETTING_LOCKED' || !dealerActionReady}
                            onClick={() => send({ action: 'shake' })}
                          >
                            Lắc bát
                          </AsyncButton>
                          <AsyncButton
                            className="bau-primary-action"
                            disabled={busy || m.status !== 'SHAKING' || !dealerActionReady}
                            onClick={() => send({ action: 'reveal' })}
                          >
                            Mở bát
                          </AsyncButton>
                          <AsyncButton
                            disabled={busy || active}
                            onClick={() => send({ action: 'release' })}
                          >
                            Nhường cái
                          </AsyncButton>
                        </>
                      )}
                    </div>
                  ) : null}
                  {!!me &&
                    !me.spectator &&
                    !isDealer &&
                    (data.dealerQueue.some((q) => q.user_id === actor) ? (
                      <AsyncButton disabled={busy} onClick={() => send({ action: 'withdraw' })}>
                        Rút khỏi danh sách chờ
                      </AsyncButton>
                    ) : (
                      <AsyncButton
                        disabled={busy || data.wallet.available < data.settings.dealerMinimum}
                        onClick={() => send({ action: 'volunteer' })}
                      >
                        <Crown size={16} />
                        Đăng ký cầm cái
                      </AsyncButton>
                    ))}
                  <div className="bau-dealer-queue">
                    <h4>Chờ nhận cái</h4>
                    {data.dealerQueue.length ? (
                      data.dealerQueue.map((p, i) => (
                        <p key={p.user_id}>
                          <span>
                            {i + 1}. {p.name}
                          </span>
                          <small>Chờ lượt</small>
                        </p>
                      ))
                    ) : (
                      <p>Chưa có người đăng ký.</p>
                    )}
                  </div>
                </section>
                <section className="bau-feed">
                  <h3>Chuyện quanh bàn</h3>
                  <div className="bau-reactions">
                    {(['❤️', '👏', '🎉', '🦀', '😮', '🍀'] as const).map((emoji) => (
                      <AsyncButton
                        key={emoji}
                        aria-label={`Gửi cảm xúc ${emoji}`}
                        disabled={busy || !me || me.banned}
                        onClick={() => send({ action: 'reaction', emoji })}
                      >
                        {emoji}
                      </AsyncButton>
                    ))}
                  </div>
                  <ol>
                    {data.events.slice(0, 8).map((e) => (
                      <li key={e.id}>
                        {e.kind === 'reaction' ? (
                          <>
                            <strong>{e.name}</strong> {String(e.details.emoji ?? '')}
                          </>
                        ) : (
                          <>
                            <span className="bau-feed-dot" />
                            <span>
                              {e.kind === 'round.settled'
                                ? 'Vừa quyết toán một vòng'
                                : e.kind === 'bet.accepted'
                                  ? `${e.name} vừa đặt cược`
                                  : e.kind === 'member.joined'
                                    ? `${e.name} đã vào bàn`
                                    : e.kind === 'dealer.assigned'
                                      ? `${e.name} nhận cái`
                                      : e.kind === 'round.started'
                                        ? 'Một vòng mới đã mở'
                                        : e.kind === 'round.cancelled'
                                          ? 'Vòng đã hủy và hoàn cược'
                                          : 'Bàn vừa được cập nhật'}
                            </span>
                          </>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
                {data.canManage && (
                  <details className="bau-management">
                    <summary>Quản lý bàn</summary>
                    <div className="bau-dealer-actions">
                      <AsyncButton
                        disabled={busy || m.pause_after_round}
                        onClick={() => send({ action: m.status === 'PAUSED' ? 'resume' : 'pause' })}
                      >
                        {m.status === 'PAUSED'
                          ? 'Tiếp tục bàn'
                          : m.pause_after_round
                            ? 'Sẽ dừng sau vòng này'
                            : 'Tạm dừng sau vòng'}
                      </AsyncButton>
                      <Confirm
                        title="Hủy vòng và hoàn coin?"
                        description="Chỉ hủy trước khi kết quả được công bố. Hoàn toàn bộ cược, giải phóng quỹ cái và không phạt nhạc."
                        onConfirm={() =>
                          send({
                            action: 'cancel',
                            reason: 'Quản trị hủy vòng trước công bố kết quả',
                          })
                        }
                      >
                        <Button
                          variant="danger"
                          disabled={
                            busy || !active || ['REVEALING', 'SETTLING'].includes(r?.status ?? '')
                          }
                        >
                          Hủy vòng an toàn
                        </Button>
                      </Confirm>
                      <Confirm
                        title="Đóng bàn Bầu Cua?"
                        confirmationText={m.name}
                        description="Chỉ đóng khi vòng đã kết thúc. Coin, lịch sử và bằng chứng quyết toán vẫn được lưu."
                        onConfirm={async () => {
                          await send({ action: 'close', name: m.name });
                          navigate(`/room/${room}/games/bau-cua`);
                        }}
                      >
                        <Button variant="danger" disabled={busy || active}>
                          Đóng bàn
                        </Button>
                      </Confirm>
                    </div>
                    <small>Không tạm dừng/hủy để thay đổi một kết quả đã công bố.</small>
                  </details>
                )}
                {!!me && (
                  <Confirm
                    title="Rời bàn Bầu Cua?"
                    description="Cược đã nhận vẫn được quyết toán; coin giữ nguyên khi quay lại. Bạn vẫn ở phòng nhạc."
                    onConfirm={async () => {
                      await send({ action: 'leave' });
                      navigate(`/room/${room}/games/bau-cua`);
                    }}
                  >
                    <Button disabled={busy}>Rời bàn chơi</Button>
                  </Confirm>
                )}
              </aside>
            </div>
          </>
        )
      )}
      <Modal
        title="Tạo bàn Bầu Cua"
        description="Coin ảo giải trí. Hãy xem luật phạt nhạc trước khi bắt đầu."
        open={creating}
        onOpenChange={setCreating}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy)
              void send({ action: 'create', name: name.trim() })
                .then((result) => {
                  setCreating(false);
                  navigate(`/room/${room}/games/bau-cua/${result.table!.id}`);
                })
                .catch(() => {});
          }}
        >
          <label>
            Tên bàn
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={60}
              required
            />
          </label>
          <Rules data={data} />
          <Button
            type="submit"
            variant="primary"
            loading={game.pending}
            disabled={busy || name.trim().length < 2}
          >
            Tạo bàn
          </Button>
        </form>
      </Modal>
      <Modal
        title={
          dialog === 'grant'
            ? 'Cấp coin cho thành viên'
            : dialog === 'rules'
              ? 'Luật Bầu Cua'
              : dialog === 'settings'
                ? 'Cài đặt Bầu Cua'
                : dialog === 'wallet'
                  ? 'Ví coin của bạn'
                  : dialog === 'history'
                    ? 'Lịch sử & người thắng'
                    : dialog === 'members'
                      ? 'Thành viên bàn'
                      : 'Kiểm tra tính công bằng'
        }
        description={
          dialog === 'grant'
            ? 'Chỉ quản trị viên hệ thống được cấp coin. Coin cộng vào ví chung của người nhận.'
            : 'Thông tin được lưu theo tài khoản và phòng hiện tại.'
        }
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        className="bau-modal"
      >
        {dialog === 'grant' && data.systemAdmin && (
          <BauCoinGrant
            members={snapshot.members}
            actor={actor}
            busy={busy}
            retry={game.retry}
            send={send}
          />
        )}
        {dialog === 'rules' && <Rules data={data} />}
        {dialog === 'settings' && (
          <BauSettings data={data} owner={snapshot.role === 'owner'} send={send} />
        )}
        {dialog === 'fairness' && fairRound && (
          <Fairness
            key={fairRound.id}
            round={
              data.round?.id === fairRound.id
                ? data.round
                : (data.history.find((entry) => entry.id === fairRound.id) ?? fairRound)
            }
            showCommitment={data.settings.showCommitment}
            showVerification={data.settings.showVerification}
          />
        )}
        {dialog === 'history' && (
          <>
            <BauLeaderboard data={data} />
            <RecentRounds data={data} onFairness={showFairness} />
          </>
        )}
        {dialog === 'wallet' && (
          <div className="bau-wallet-detail">
            <h3>{money(data.wallet.total)} coin tổng cộng</h3>
            <p>
              {money(data.wallet.available)} khả dụng · {money(data.wallet.reserved)} đang khóa
              trong cược/quỹ cái ở tất cả các bàn.
            </p>
            <div className="bau-bonuses">
              <AsyncButton
                disabled={busy || !data.canDaily}
                onClick={() => send({ action: 'daily' })}
              >
                Nhận thưởng ngày +{money(data.economy.dailyAmount)}
              </AsyncButton>
              <AsyncButton
                disabled={busy || !data.canRelief}
                onClick={() => send({ action: 'relief' })}
              >
                Nhận cứu trợ +{money(data.economy.reliefAmount)}
              </AsyncButton>
            </div>
            <small>
              Ngày thưởng theo {data.economy.timezone}. Cứu trợ: tổng coin dưới{' '}
              {money(data.economy.reliefThreshold)}, cách nhau ít nhất {data.economy.reliefHours}{' '}
              giờ.{' '}
              {data.reliefAt &&
                `Mốc nhận tiếp: ${new Date(data.reliefAt).toLocaleString('vi-VN')}.`}
            </small>
            <h3>Sổ coin · 50 giao dịch gần nhất</h3>
            <ol className="bau-ledger">
              {data.ledger.map((e) => (
                <li key={e.id}>
                  <span>
                    {(
                      {
                        INITIAL_GRANT: 'Coin khởi đầu',
                        DAILY_BONUS: 'Thưởng ngày',
                        RELIEF_BONUS: 'Cứu trợ',
                        BET_RESERVED: 'Khóa cược',
                        BET_REFUND: 'Hoàn cược',
                        DEALER_RESERVED: 'Quỹ bảo đảm',
                        BET_SETTLED_WIN: 'Trả cược thắng',
                        BET_SETTLED_LOSS: 'Cược không trúng',
                        DEALER_SETTLEMENT: 'Quyết toán cái',
                        ADMIN_ADJUSTMENT: 'Điều chỉnh quản trị',
                      } as Record<string, string>
                    )[e.reason] ?? e.reason}
                    <small>{new Date(e.created_at).toLocaleString('vi-VN')}</small>
                  </span>
                  <b>
                    {e.available_delta > 0 ? '+' : ''}
                    {money(e.available_delta)}
                    <small>
                      Khóa {e.reserved_delta > 0 ? '+' : ''}
                      {money(e.reserved_delta)}
                    </small>
                  </b>
                </li>
              ))}
            </ol>
            <h3>Hình phạt trong phòng</h3>
            {data.penalties
              .filter((p) => p.user_id === actor || data.canRestore)
              .map((p) => (
                <article className="bau-penalty-history" key={p.id}>
                  <strong>
                    {p.name} ·{' '}
                    {p.status === 'APPLIED' ? 'Đã gỡ bài đang chờ' : 'Không có bài phù hợp'}
                  </strong>
                  {p.songs.map((song) => (
                    <div key={song.id}>
                      <span>{song.title}</span>
                      {song.restored ? (
                        <small>
                          <Check size={14} />
                          Đã khôi phục
                        </small>
                      ) : data.canRestore ? (
                        <AsyncButton
                          disabled={busy}
                          onClick={() => send({ action: 'restore', penalty: p.id, entry: song.id })}
                        >
                          Khôi phục bài
                        </AsyncButton>
                      ) : null}
                    </div>
                  ))}
                </article>
              ))}
            <details>
              <summary>Tình trạng đồng bộ</summary>
              <p>
                Sổ coin {data.diagnostics.walletConsistent ? 'khớp số dư' : 'cần kiểm tra'}. Thông
                báo đang chờ gửi: {data.diagnostics.pendingEvents}.{' '}
                {data.diagnostics.lastSettled &&
                  `Lần quyết toán gần nhất: ${new Date(data.diagnostics.lastSettled).toLocaleString('vi-VN')}.`}
              </p>
            </details>
          </div>
        )}
        {dialog === 'members' && (
          <div className="bau-members">
            {data.members.map((p) => (
              <article key={p.user_id}>
                <span className={'bau-avatar ' + (p.online ? 'online' : '')}>
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.banned
                      ? 'Bị chặn'
                      : p.user_id === m?.dealer_id
                        ? 'Đang cầm cái'
                        : p.spectator
                          ? 'Khán giả'
                          : 'Người chơi'}{' '}
                    · {p.online ? 'Online' : 'Offline'}
                  </small>
                </div>
                {data.canManage && p.user_id !== actor && p.user_id !== snapshot.room.owner_id && (
                  <div className="bau-member-actions">
                    {!p.banned && !p.spectator && (
                      <AsyncButton
                        disabled={busy || active || !p.online}
                        onClick={() => send({ action: 'assign', user: p.user_id })}
                      >
                        Giao cái
                      </AsyncButton>
                    )}
                    {p.banned ? (
                      <AsyncButton
                        disabled={busy}
                        onClick={() => send({ action: 'unban', user: p.user_id })}
                      >
                        Bỏ chặn
                      </AsyncButton>
                    ) : (
                      <Confirm
                        title={`Mời ${p.name} rời bàn?`}
                        description="Chặn người này tham gia bàn. Cược đã nhận vẫn được quyết toán đúng, không tịch thu coin."
                        onConfirm={() => send({ action: 'kick', user: p.user_id, ban: true })}
                      >
                        <Button disabled={busy} variant="danger">
                          Mời ra & chặn
                        </Button>
                      </Confirm>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Modal>
    </section>
  );
}

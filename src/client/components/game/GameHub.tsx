import { useEffect, useRef, useState, type FormEvent } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Dice5,
  Flag,
  Gamepad2,
  Plus,
  Share2,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  BookOpen,
  Pause,
  Play,
  RefreshCw,
  MoreHorizontal,
  History,
  Layers3,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Snapshot } from '../../../shared/contracts';
import {
  colorNames,
  defaultRules,
  rulesSchema,
  isCaNgua,
  statusNames,
  type GameRules,
  type GameSnapshot,
  type LegalMove,
} from '../../../shared/game/contracts';
import { calculateRanking, getLegalMoves } from '../../../shared/game/engine';
import { api } from '../../lib/api';
import { useGame } from '../../lib/game';
import {
  clearGameRequest,
  gameOutboxKey,
  readGameRequest,
  saveGameRequest,
  uncertainGameRequest,
  type GameRequest,
} from '../../lib/game-outbox';
import { AsyncButton, Button, Confirm, ErrorState, Loading, Modal } from '../ui';
import LudoBoard from './LudoBoard';
import Dice from './Dice';
import './game.css';

function RulesFields({
  rules,
  onChange,
  disabled = false,
}: {
  rules: GameRules;
  onChange: (r: GameRules) => void;
  disabled?: boolean;
}) {
  const v2 = isCaNgua(rules);
  return (
    <fieldset disabled={disabled} className="game-rules-fields">
      <legend>Luật của bàn</legend>
      <label>
        Ra quân
        <select
          value={rules.entry}
          onChange={(e) => onChange({ ...rules, entry: e.target.value as GameRules['entry'] })}
        >
          <option value="SIX">Tung được 6</option>
          <option value="ONE_OR_SIX">Tung được 1 hoặc 6</option>
        </select>
      </label>
      {!v2 && (
        <label>
          Ô an toàn
          <select
            value={rules.safe}
            onChange={(e) => onChange({ ...rules, safe: e.target.value as GameRules['safe'] })}
          >
            <option value="STARS">Ô xuất phát và ô sao</option>
            <option value="STARTS">Chỉ ô xuất phát</option>
            <option value="NONE">Không có</option>
          </select>
        </label>
      )}
      {v2 && (
        <label className="game-check">
          <input
            type="checkbox"
            checked={rules.jumpOnOne}
            onChange={(e) => onChange({ ...rules, jumpOnOne: e.target.checked })}
          />
          Ra 1 được nhảy tới cửa chuồng khi đường trống
        </label>
      )}
      <label>
        Thời gian mỗi lượt
        <select
          value={rules.turnSeconds}
          onChange={(e) =>
            onChange({ ...rules, turnSeconds: Number(e.target.value) as GameRules['turnSeconds'] })
          }
        >
          {[30, 45, 60, 90].map((n) => (
            <option key={n} value={n}>
              {n} giây
            </option>
          ))}
        </select>
      </label>
      <label>
        Đầu hàng sau
        <select
          value={rules.maxMisses}
          onChange={(e) => onChange({ ...rules, maxMisses: Number(e.target.value) })}
        >
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} lượt bỏ lỡ liên tiếp
            </option>
          ))}
        </select>
      </label>
      {!v2 &&
        (
          [
            ['threeSixes', 'Ba lần 6 liên tiếp mất lượt'],
            ['captureBonus', 'Thêm lượt khi đá quân'],
            ['finishBonus', 'Thêm lượt khi một quân về đích'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="game-check">
            <input
              type="checkbox"
              checked={rules[key]}
              onChange={(e) => onChange({ ...rules, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
    </fieldset>
  );
}
function RulesHelp({ rules }: { rules: GameRules }) {
  if (isCaNgua(rules))
    return (
      <div className="game-guide">
        <p>
          <strong>Cờ cá ngựa ROOMTUNE · Bộ luật v2</strong>
        </p>
        <ol>
          <li>
            Mỗi người 4 ngựa; ra {rules.entry === 'SIX' ? '6' : '1 hoặc 6'} để xuất vào ô trống.
            Không đứng chồng quân.
          </li>
          <li>
            Đi một vòng 56 ô. Ô cuối là cửa chuồng của mình; ô kế tiếp trên đường chung là ô xuất
            quân. Ô có hình ngựa là xuất quân, ô có mũi tên là cửa chuồng. Đến cửa phải dừng, lần
            tung sau mới vào chuồng.
          </li>
          <li>
            Không vượt bất kỳ quân nào. Đối thủ cách 3 ô: ra 2 được đi, ra 3 đá, ra 4–6 bị chặn.
            Không có ô an toàn trên đường chung.
          </li>
          <li>
            {rules.jumpOnOne
              ? 'Ra 1: chọn đi một ô hoặc nhảy tới cửa chuồng kế tiếp nếu cả đoạn và ô cửa đều trống. Nhảy không đá quân và không đi quá cửa của mình.'
              : 'Đã tắt nhảy cửa chuồng; ra 1 chỉ đi một ô.'}
          </li>
          <li>
            Đứng ở cửa: ra số nào vào bậc đó nếu đường vào trống. Đã ở bậc n: phải ra n + 1 để lên
            đúng một bậc; không vượt hoặc chồng ngựa trong chuồng.
          </li>
          <li>
            Xếp đủ bốn ngựa ở bậc 6, 5, 4, 3 để hoàn thành. Chỉ ra 6 được tung thêm; không phạt ba
            lần 6 liên tiếp.
          </li>
          <li>
            Chọn ngẫu nhiên người đi đầu. Mỗi lượt {rules.turnSeconds} giây cho cả tung và đi;{' '}
            {rules.maxMisses} lượt vắng liên tiếp thì đầu hàng. Mở lại giữ nguyên xúc xắc và thời
            hạn.
          </li>
        </ol>
        <p>
          Quản trò có thể tạm dừng. Về phòng nhạc hoặc chat vẫn giữ ghế; đầu hàng là thao tác riêng.
        </p>
      </div>
    );
  return (
    <div className="game-guide">
      <p>
        <strong>Ludo ROOMTUNE · Bộ luật v1</strong>
      </p>
      <p>
        Bàn này giữ luật cũ. Để chơi luật cờ cá ngựa mới, vào Danh sách bàn → Tạo bàn mới. Các ô có
        vòng viền chấm là ô an toàn theo thiết lập của bàn này.
      </p>
      <ol>
        <li>
          Mỗi người 4 ngựa. Ra quân khi tung {rules.entry === 'SIX' ? '6' : '1 hoặc 6'}; sau đó đi
          đúng số xúc xắc.
        </li>
        <li>
          Đi hết 52 ô chung rồi vào đường đích riêng 6 ô. Phải tung đúng số còn thiếu, không đi quá
          đích.
        </li>
        <li>
          Ô{' '}
          {rules.safe === 'NONE'
            ? 'nào cũng có thể bị đá'
            : rules.safe === 'STARTS'
              ? 'xuất phát có màu được bảo vệ'
              : 'xuất phát và ô sao được bảo vệ'}
          . Đến ô không an toàn sẽ đá tất cả ngựa đối thủ tại đó về nhà.
        </li>
        <li>
          Các quân có thể đứng chung ô; không có hàng rào chặn đường. Ngựa trong đường đích không bị
          đá.
        </li>
        <li>
          Tung 6 được thêm lượt.{' '}
          {rules.threeSixes
            ? 'Ba lần 6 liên tiếp mất lượt, lần thứ ba không được đi.'
            : 'Không giới hạn số lần 6 liên tiếp.'}{' '}
          {rules.captureBonus ? 'Đá quân cũng được thêm lượt.' : ''}{' '}
          {rules.finishBonus ? 'Một quân về đích cũng được thêm lượt.' : ''}
        </li>
        <li>
          Đủ bốn ngựa về đích được xếp hạng. Ván tiếp tục đến khi còn một người; người đầu hàng xếp
          sau.
        </li>
        <li>
          Mỗi lượt {rules.turnSeconds} giây gồm cả tung và chọn quân. Hết giờ mất lượt;{' '}
          {rules.maxMisses} lượt vắng liên tiếp sẽ đầu hàng. Mở lại trước hạn giữ nguyên xúc xắc.
        </li>
      </ol>
      <p>
        Quản trò có thể tạm dừng ván. Rời màn hình để tìm bài hoặc chat vẫn giữ ghế; chỉ nút đầu
        hàng mới bỏ ván đang chơi. Host nhạc và quản trò là hai quyền độc lập.
      </p>
    </div>
  );
}
export default function GameHub({
  snapshot,
  visible,
  onShow,
}: {
  snapshot: Snapshot;
  visible: boolean;
  onShow: () => void;
}) {
  const room = snapshot.room.id,
    actor = snapshot.me;
  const route = useLocation();
  const navigate = useNavigate();
  const routeMatch = matchPath('/room/:id/games/:match', route.pathname)?.params.match ?? null;
  // Retain the subscription/outbox while visiting music. The lobby deliberately clears selection.
  const [lastMatch, setLastMatch] = useState<string | null>(routeMatch);
  const match = visible ? routeMatch : lastMatch;
  useEffect(() => {
    if (visible) setLastMatch(routeMatch);
  }, [visible, routeMatch]);
  const game = useGame(room, actor, match, visible);
  const client = useQueryClient();
  const [creating, setCreating] = useState(false),
    [saving, setSaving] = useState(false);
  const [name, setName] = useState('Vui cùng ' + snapshot.room.name.slice(0, 40));
  const [rules, setRules] = useState<GameRules>({ ...defaultRules });
  const [help, setHelp] = useState(false),
    [editing, setEditing] = useState(false);
  const [options, setOptions] = useState(false),
    [history, setHistory] = useState(false);
  const [sound, setSound] = useState(false),
    [clock, setClock] = useState(Date.now());
  const [depth, setDepth] = useState(() => localStorage.getItem('roomtune:ludo:depth') !== 'flat');
  const context = useRef<AudioContext | null>(null),
    lastSound = useRef<number | null>(null),
    lastTurn = useRef<string | null>(null);
  const createScope = gameOutboxKey(room, actor, null);
  const [createReceipt, setCreateReceipt] = useState<GameRequest<{
    name: string;
    rules: GameRules;
  }> | null>(() => readGameRequest(createScope, true));
  const live = useRef(true),
    createBusy = useRef(false);
  const setMatch = (id: string | null) => {
    setOptions(false);
    setHistory(false);
    setLastMatch(id);
    navigate('/room/' + room + '/games' + (id ? '/' + encodeURIComponent(id) : ''));
  };
  const state = game.data?.state;
  const [moveChoice, setMoveChoice] = useState<{
    game: string;
    version: number;
    piece: number;
  } | null>(null);
  const choicePanel = useRef<HTMLDivElement>(null);
  const selectedPiece =
    state && moveChoice?.game === state.id && moveChoice.version === state.version
      ? moveChoice.piece
      : null;
  useEffect(() => {
    if (selectedPiece !== null) choicePanel.current?.querySelector('button')?.focus();
  }, [selectedPiece]);
  const sendMove = (move: LegalMove) =>
    game.send({
      action: 'move',
      piece: move.piece,
      ...(move.moveKind ? { moveKind: move.moveKind } : {}),
    });
  const choosePiece = async (piece: number) => {
    if (!state) return;
    const choices = getLegalMoves(state, actor).filter((m) => m.piece === piece);
    if (choices.length === 1) await sendMove(choices[0]);
    else if (choices.length > 1) setMoveChoice({ game: state.id, version: state.version, piece });
  };
  const moveLabel = (m: LegalMove) =>
    m.from === -1
      ? 'Ra quân'
      : m.moveKind === 'JUMP'
        ? `Nhảy tới cửa chuồng · ${m.to - m.from} ô`
        : state?.schema === 2 && m.to >= 56
          ? `Vào bậc ${m.to - 55}`
          : state?.schema === 1 && m.to === 57
            ? 'Về đích'
            : 'Đi ' + state?.dice + ' ô';
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      void context.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    if (
      state.turn === actor &&
      state.status === 'PLAYING' &&
      lastTurn.current !== state.turn &&
      !visible
    )
      toast.info('Đến lượt bạn ở ' + state.name, {
        action: {
          label: 'Mở bàn',
          onClick: () => {
            if (match) navigate('/room/' + room + '/games/' + encodeURIComponent(match));
            else onShow();
          },
        },
      });
    lastTurn.current = state.turn;
    if (
      lastSound.current !== null &&
      state.version === lastSound.current + 1 &&
      !document.hidden &&
      visible &&
      sound &&
      context.current &&
      ['dice_rolled', 'piece_moved', 'finished'].includes(state.last.type)
    ) {
      const audio = context.current,
        osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value =
        state.last.type === 'finished' ? 660 : state.last.type === 'piece_moved' ? 440 : 330;
      gain.gain.setValueAtTime(0.035, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.13);
    }
    lastSound.current = state.version;
  }, [state, actor, visible, onShow, sound, match, navigate, room]);
  const create = async (e?: FormEvent) => {
    e?.preventDefault();
    if (createBusy.current) return;
    createBusy.current = true;
    setSaving(true);
    const request = createReceipt ?? {
      body: { name: name.trim(), rules: rulesSchema.parse(rules) },
      key: crypto.randomUUID(),
    };
    try {
      saveGameRequest(createScope, request);
      setCreateReceipt(request);
      const result = await api<GameSnapshot>(
        '/rooms/' + room + '/games',
        request.body,
        request.key,
        actor,
      );
      clearGameRequest(createScope, request.key);
      if (!live.current) return;
      setCreateReceipt(null);
      client.setQueryData(['game', room, actor, result.state.id], result);
      setMatch(result.state.id);
      setCreating(false);
      void client.invalidateQueries({ queryKey: ['games', room, actor] });
      toast.success('Bàn đã sẵn sàng. Mời bạn bè vào chơi!');
    } catch (error) {
      if (!uncertainGameRequest(error)) {
        clearGameRequest(createScope, request.key);
        if (live.current) setCreateReceipt(null);
      }
      if (live.current) toast.error((error as Error).message);
    } finally {
      createBusy.current = false;
      if (live.current) setSaving(false);
    }
  };
  const invite = async () => {
    const url = new URL('/room/' + room + '/games/' + encodeURIComponent(match!), location.origin);
    await navigator.clipboard.writeText(url.toString());
    toast.success('Đã sao chép lời mời. Gửi vào chat cho thành viên cùng phòng.');
  };
  if (!visible) return null;
  const player = state?.players.find((p) => p.id === actor);
  const manager = snapshot.role !== 'member';
  const host = state?.host === actor || manager;
  const waiting = state && ['WAITING', 'READY'].includes(state.status);
  const ended = state && ['FINISHED', 'CANCELLED'].includes(state.status);
  const turn = state?.players.find((p) => p.id === state.turn);
  const seconds =
    state?.deadline === null
      ? null
      : Math.min(
          state?.rules.turnSeconds ?? 90,
          Math.max(0, Math.ceil(((state?.deadline ?? 0) - clock - game.offset.current) / 1000)),
        );
  const moves = state ? getLegalMoves(state, actor) : [];
  const busy = game.pending || game.retry || !!game.query.error;
  return (
    <section
      className={
        'game-hub' + (match ? ' game-match' : ' game-lobby') + (depth ? ' game-depth' : '')
      }
      aria-label="Trò chơi trong phòng"
    >
      <div className="game-header">
        <div>
          <span className="game-eyebrow">
            <Gamepad2 size={15} />
            {state?.schema === 1 && match ? 'BÀN LUẬT CŨ · 52 Ô' : 'ROOMTUNE PLAY'}
          </span>
          <h2>{match ? (state?.name ?? 'Bàn cờ cá ngựa') : 'Nhạc hay. Bạn vui. Vào ván thôi.'}</h2>
          {!match && <p>Chơi cùng những người trong phòng. Giai điệu vẫn tiếp tục.</p>}
        </div>
        <div className="game-header-actions">
          {match && (
            <Button variant="ghost" aria-label="Danh sách bàn" onClick={() => setMatch(null)}>
              <ArrowLeft size={17} />
              <span>Danh sách bàn</span>
            </Button>
          )}
          <Button
            variant="ghost"
            aria-label="Luật chơi"
            onClick={() => {
              setRules(state?.rules ?? defaultRules);
              setHelp(true);
            }}
          >
            <BookOpen size={17} />
            <span>Luật chơi</span>
          </Button>
          {match && (
            <Button aria-label="Tùy chọn bàn" variant="ghost" onClick={() => setOptions(true)}>
              <MoreHorizontal size={20} />
              <span>Tùy chọn</span>
            </Button>
          )}
        </div>
      </div>
      {!match ? (
        <>
          {createReceipt && !saving && (
            <div className="notice" role="alert">
              Yêu cầu mở bàn trước chưa được xác nhận. Khôi phục để tránh tạo hai bàn.
              <AsyncButton onClick={() => create()}>Khôi phục bàn vừa tạo</AsyncButton>
            </div>
          )}
          <div className="game-lobby-hero">
            <div className="game-hero-horse" aria-hidden="true">
              ♞
            </div>
            <div>
              <span className="badge">2–4 NGƯỜI · CHƠI THEO LƯỢT</span>
              <h3>Cờ cá ngựa</h3>
              <p>
                Một chút may mắn. Một nước đi khéo.
                <br />
                Cả bàn cùng chờ cú tung tiếp theo.
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  setRules(defaultRules);
                  setCreating(true);
                }}
              >
                <Plus size={18} /> Tạo bàn mới
              </Button>
            </div>
            <div className="game-hero-dice" aria-hidden="true">
              ⚄
            </div>
          </div>
          <div className="game-section-heading">
            <h3>Các bàn trong phòng</h3>
            <span>
              {game.list.data?.length ?? 0} bàn · trang {game.page + 1}
            </span>
          </div>
          {game.list.isPending ? (
            <Loading>Đang tìm bàn chơi…</Loading>
          ) : game.list.error ? (
            <ErrorState error={game.list.error} retry={() => void game.list.refetch()} />
          ) : (
            <div className="game-tables">
              {game.list.data?.map((table) => (
                <button
                  className="game-table-card"
                  key={table.id}
                  onClick={() => setMatch(table.id)}
                >
                  <div className="game-table-icon">
                    <Dice5 size={25} />
                  </div>
                  <div>
                    <strong>{table.name}</strong>
                    <p>
                      {statusNames[table.status]} · {table.players.length}/4 người · Ván{' '}
                      {table.round}
                    </p>
                    <div className="game-seat-dots">
                      {[0, 1, 2, 3].map((c) => (
                        <span
                          key={c}
                          role="img"
                          className={
                            'ludo-color-' +
                            c +
                            (table.players.some((p) => p.color === c) ? ' occupied' : '')
                          }
                          aria-label={
                            colorNames[c] +
                            (table.players.some((p) => p.color === c)
                              ? ' đã có người'
                              : ' còn trống')
                          }
                        >
                          {['◆', '♣', '★', '●'][c]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span>
                    {table.players.some((p) => p.id === actor)
                      ? 'Vào lại bàn →'
                      : ['WAITING', 'READY'].includes(table.status)
                        ? 4 - table.players.length + ' ghế trống →'
                        : 'Xem bàn →'}
                  </span>
                </button>
              ))}
              {!game.list.data?.length && (
                <div className="game-empty">
                  <Users size={30} />
                  <h3>Chưa có bàn ở trang này</h3>
                  <p>Mở một bàn và rủ cả phòng tham gia.</p>
                </div>
              )}
            </div>
          )}
          <div className="game-pagination">
            <Button disabled={game.page === 0} onClick={() => game.setPage((p) => p - 1)}>
              Trang trước
            </Button>
            <Button
              disabled={(game.list.data?.length ?? 0) < 20}
              onClick={() => game.setPage((p) => p + 1)}
            >
              Trang sau
            </Button>
          </div>
        </>
      ) : (
        <>
          {game.query.error && (
            <div className="notice" role="alert">
              {game.query.error.message}
              <Button onClick={() => void game.query.refetch()}>Kết nối lại</Button>
            </div>
          )}
          {game.retry && (
            <div className="notice" role="alert">
              Chưa xác nhận thao tác trước. Kiểm tra lại bằng cùng mã yêu cầu để không tung thêm lần
              nữa.
              <AsyncButton onClick={() => game.send()}>
                <RefreshCw size={16} /> Xác minh thao tác
              </AsyncButton>
            </div>
          )}
          {!state ? (
            game.query.isPending ? (
              <Loading>Đang khôi phục bàn cờ…</Loading>
            ) : null
          ) : (
            <>
              <div className="game-match-meta">
                <h3>
                  {state.name} <span className="badge">Ván {state.round}</span>
                  <span className="badge">
                    {state.schema === 2 ? 'Cờ cá ngựa v2' : 'Ludo v1 · Bàn cũ'}
                  </span>
                </h3>
                <span className="game-connection">{game.connection}</span>
              </div>
              <div className="game-players">
                {[0, 1, 2, 3].map((color) => {
                  const p = state.players.find((p) => p.color === color);
                  return (
                    <div
                      key={color}
                      className={
                        'game-player ludo-color-' + color + (state.turn === p?.id ? ' current' : '')
                      }
                    >
                      <span className="game-player-symbol">{['◆', '♣', '★', '●'][color]}</span>
                      <div>
                        <strong>
                          {p?.name ?? 'Ghế trống'}
                          {p?.id === actor ? ' · Bạn' : ''}
                          {p?.id === state.host ? ' · Quản trò' : ''}
                        </strong>
                        <small>
                          {colorNames[color]} ·{' '}
                          {p
                            ? waiting
                              ? p.ready
                                ? 'Đã sẵn sàng'
                                : 'Chưa sẵn sàng'
                              : p.rank
                                ? 'Hạng ' + p.rank + (p.status === 'FORFEITED' ? ' · Đầu hàng' : '')
                                : state.schema === 2
                                  ? p.pieces.filter((n) => n >= 56).length + '/4 vào chuồng'
                                  : p.pieces.filter((n) => n === 57).length + '/4 về đích'
                            : 'Mời bạn vào chơi'}
                        </small>
                      </div>
                      {!p && waiting && (
                        <AsyncButton
                          disabled={busy}
                          onClick={() => game.send({ action: player ? 'color' : 'join', color })}
                        >
                          {player ? 'Đổi màu' : 'Ngồi đây'}
                        </AsyncButton>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="game-arena">
                <div className="game-board-frame">
                  {state.status === 'FINISHED' && (
                    <section className="game-results" aria-label="Kết quả ván">
                      <div className="game-confetti" aria-hidden="true">
                        {Array.from({ length: 18 }, (_, i) => (
                          <i
                            key={i}
                            style={{
                              left: `${5 + i * 5}%`,
                              background: `var(--horse-${i % 4})`,
                              animationDelay: `${(i % 5) * 0.06}s`,
                            }}
                          />
                        ))}
                      </div>
                      <Trophy size={34} />
                      <h3>Chúc mừng {calculateRanking(state)[0]?.name}!</h3>
                      <div>
                        {calculateRanking(state).map((p) => (
                          <p key={p.id}>
                            <strong>
                              #{p.rank} {p.name}
                            </strong>
                            <span>{p.status === 'FORFEITED' ? 'Đầu hàng' : 'Hoàn thành'}</span>
                          </p>
                        ))}
                      </div>
                    </section>
                  )}

                  <div className="ludo-board-surface">
                    <LudoBoard
                      state={state}
                      actor={actor}
                      disabled={busy}
                      selectedPiece={selectedPiece}
                      onMove={(piece) => {
                        void choosePiece(piece).catch(() => {});
                      }}
                    />
                  </div>
                </div>
                <aside className="game-controls">
                  <div className="game-turn-card">
                    <span className="game-eyebrow">
                      {statusNames[state.status]}
                      {waiting || ended ? '' : ' · Ván ' + state.round}
                      {state.schema === 1 ? ' · Luật v1' : ' · Cờ cá ngựa'}
                    </span>
                    <h3 aria-live="polite" aria-atomic="true">
                      {waiting
                        ? 'Chờ đủ người, cùng sẵn sàng'
                        : ended
                          ? 'Ván chơi đã khép lại'
                          : state.status === 'PAUSED'
                            ? 'Một chút nghỉ giữa ván'
                            : state.turn === actor
                              ? 'Đến lượt của bạn'
                              : turn?.name + ' đang đi'}
                    </h3>
                    {state.status === 'PLAYING' && (
                      <>
                        <div className="game-dice-row">
                          <Dice
                            value={state.dice ?? state.last.dice ?? null}
                            eventKey={state.id + ':' + state.round + ':' + state.version}
                            rolled={['dice_rolled', 'no_moves', 'three_sixes'].includes(
                              state.last.type,
                            )}
                            busy={game.pending && game.pendingAction === 'roll'}
                          />
                          <div>
                            <strong
                              className={
                                seconds !== null && seconds <= 10
                                  ? 'game-clock urgent'
                                  : 'game-clock'
                              }
                            >
                              {seconds}s
                            </strong>
                            <small>
                              {state.phase === 'ROLL' ? 'Tung xúc xắc' : 'Chọn một ngựa để đi'}
                            </small>
                          </div>
                        </div>
                        {state.turn === actor && state.phase === 'ROLL' && (
                          <AsyncButton
                            variant="primary"
                            disabled={busy}
                            onClick={() => game.send({ action: 'roll' })}
                          >
                            <Dice5 size={19} /> Tung xúc xắc
                          </AsyncButton>
                        )}
                        {moves.length > 0 && (
                          <div
                            className={
                              'game-move-choices' + (selectedPiece !== null ? ' choosing-move' : '')
                            }
                            ref={choicePanel}
                          >
                            {selectedPiece !== null && (
                              <p className="game-choice-hint">
                                Ngựa {selectedPiece + 1}: chọn cách đi
                              </p>
                            )}
                            {(selectedPiece !== null
                              ? moves.filter((m) => m.piece === selectedPiece)
                              : moves.filter(
                                  (m, i) =>
                                    moves.findIndex((other) => other.piece === m.piece) === i,
                                )
                            ).map((m) => (
                              <AsyncButton
                                key={m.piece + ':' + m.moveKind}
                                disabled={busy}
                                onClick={() =>
                                  selectedPiece !== null ? sendMove(m) : choosePiece(m.piece)
                                }
                              >
                                Ngựa {m.piece + 1}
                                <small>
                                  {selectedPiece === null &&
                                  moves.filter((other) => other.piece === m.piece).length > 1
                                    ? 'Chọn đi 1 ô hoặc nhảy'
                                    : moveLabel(m)}
                                </small>
                              </AsyncButton>
                            ))}
                            {selectedPiece !== null && (
                              <Button disabled={busy} onClick={() => setMoveChoice(null)}>
                                Chọn ngựa khác
                              </Button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {ended && host && (
                      <AsyncButton
                        variant="primary"
                        disabled={busy}
                        onClick={() => game.send({ action: 'rematch' })}
                      >
                        <RefreshCw size={16} /> Chơi lại
                      </AsyncButton>
                    )}
                    {state.status === 'PAUSED' && host && (
                      <AsyncButton
                        variant="primary"
                        disabled={busy}
                        onClick={() => game.send({ action: 'resume' })}
                      >
                        <Play size={16} /> Tiếp tục ván
                      </AsyncButton>
                    )}
                    {waiting && (
                      <>
                        {player && (
                          <AsyncButton
                            variant={player.ready ? 'secondary' : 'primary'}
                            disabled={busy}
                            onClick={() => game.send({ action: 'ready', ready: !player.ready })}
                          >
                            {player.ready ? 'Hủy sẵn sàng' : 'Tôi đã sẵn sàng'}
                          </AsyncButton>
                        )}
                        {host && (
                          <AsyncButton
                            variant="primary"
                            disabled={busy || state.status !== 'READY'}
                            onClick={() => game.send({ action: 'start' })}
                          >
                            <Play size={16} /> Bắt đầu ván
                          </AsyncButton>
                        )}
                        <p className="muted">
                          Cần ít nhất 2 người. Mỗi người tự chọn ghế và bấm sẵn sàng.
                        </p>
                      </>
                    )}
                    {state.last.type === 'no_moves' && (
                      <p className="notice">
                        Không có nước đi với số vừa tung. Lượt đã được xử lý.
                      </p>
                    )}
                    {state.last.type === 'three_sixes' && (
                      <p className="notice">Ba lần 6 liên tiếp: mất lượt này.</p>
                    )}
                    {state.last.type === 'timeout' && (
                      <p className="notice">Một lượt đã hết thời gian. Bàn tiếp tục tự động.</p>
                    )}
                    {(state.last.captures?.length ?? 0) > 0 && (
                      <p className="game-capture" key={state.version}>
                        ♞ Đã đá {state.last.captures!.length} ngựa về nhà!
                      </p>
                    )}
                  </div>
                </aside>
              </div>
            </>
          )}
        </>
      )}
      {state && (
        <Modal
          title="Tùy chọn bàn"
          description="Rời màn hình vẫn giữ ghế. Đầu hàng là thao tác riêng."
          open={options}
          onOpenChange={setOptions}
        >
          <div className="game-toolbar">
            <Button
              aria-pressed={depth}
              onClick={() => {
                setDepth((v) => !v);
                localStorage.setItem('roomtune:ludo:depth', depth ? 'flat' : 'depth');
              }}
            >
              <Layers3 size={16} /> {depth ? 'Góc nhìn thẳng' : 'Góc nhìn nổi'}
            </Button>
            <Button variant="ghost" onClick={() => setMatch(null)}>
              <ArrowLeft size={16} /> Danh sách bàn
            </Button>
            <AsyncButton onClick={invite}>
              <Share2 size={16} /> Mời vào bàn
            </AsyncButton>
            <Button
              aria-pressed={sound}
              onClick={() => {
                if (!sound) {
                  context.current ??= new AudioContext();
                  void context.current.resume();
                }
                setSound((v) => !v);
              }}
            >
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} {sound ? 'Tắt' : 'Bật'} âm
              game
            </Button>
          </div>

          {host && (
            <div className="game-admin-actions">
              {waiting && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setRules(state.rules);
                    setEditing(true);
                  }}
                >
                  Tùy chỉnh luật
                </Button>
              )}
              {state.status === 'PLAYING' && (
                <AsyncButton disabled={busy} onClick={() => game.send({ action: 'pause' })}>
                  <Pause size={16} /> Tạm dừng ván
                </AsyncButton>
              )}
              {waiting && (
                <Confirm title="Hủy bàn chơi?" onConfirm={() => game.send({ action: 'cancel' })}>
                  <Button disabled={busy} variant="ghost">
                    Hủy bàn
                  </Button>
                </Confirm>
              )}
            </div>
          )}
          {player && waiting && (
            <AsyncButton disabled={busy} onClick={() => game.send({ action: 'leave' })}>
              Rời ghế
            </AsyncButton>
          )}
          {player?.status === 'ACTIVE' && ['PLAYING', 'PAUSED'].includes(state.status) && (
            <Confirm
              title="Đầu hàng ván này?"
              description="Ngựa của bạn sẽ rời bàn và bạn xếp sau những người còn chơi. Bạn vẫn có thể xem và tham gia ván tiếp theo."
              onConfirm={() => game.send({ action: 'surrender' })}
            >
              <Button disabled={busy} variant="ghost">
                <Flag size={16} /> Đầu hàng
              </Button>
            </Confirm>
          )}
          <div className="game-spectators">
            <Users size={16} />
            <span>
              {
                game.data!.spectators.filter((p) => !state.players.some((x) => x.id === p.id))
                  .length
              }{' '}
              khán giả
            </span>
            <p>
              {game
                .data!.spectators.filter((p) => !state.players.some((x) => x.id === p.id))
                .map((p) => p.name)
                .join(', ') || 'Thành viên trong phòng có thể vào xem.'}
            </p>
          </div>

          <Button
            onClick={() => {
              setOptions(false);
              setHistory(true);
            }}
          >
            <History size={17} /> Lịch sử kết quả
          </Button>
        </Modal>
      )}
      {state && (
        <Modal
          title="Lịch sử kết quả"
          description="Thứ hạng các ván đã chơi tại bàn này."
          open={history}
          onOpenChange={setHistory}
        >
          {game.data!.results.length > 0 && (
            <div className="game-history">
              <h3>Lịch sử kết quả · {game.data!.results.length} ván gần nhất</h3>
              {game.data!.results.map((result) => (
                <div key={result.round}>
                  <strong>Ván {result.round}</strong>
                  <p>
                    {[...result.rankings]
                      .sort((a, b) => (a.rank ?? 5) - (b.rank ?? 5))
                      .map((p) => '#' + p.rank + ' ' + p.name)
                      .join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!game.data?.results.length && (
            <p>Chưa có ván trước. Kết quả sẽ xuất hiện tại đây khi kết thúc.</p>
          )}
        </Modal>
      )}
      <Modal
        title="Mở một bàn cờ cá ngựa"
        description="Chọn luật trước ván. Mọi thành viên cùng phòng đều có thể tham gia."
        open={creating}
        onOpenChange={(v) => {
          if (!saving) setCreating(v);
        }}
      >
        <form onSubmit={(e) => void create(e)}>
          <label>
            Tên bàn
            <input
              required
              disabled={saving || !!createReceipt}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <RulesFields rules={rules} onChange={setRules} disabled={saving || !!createReceipt} />
          <Button type="submit" variant="primary" loading={saving}>
            Tạo bàn
          </Button>
        </form>
      </Modal>
      <Modal
        title="Luật cờ cá ngựa"
        description="Bộ luật được thống nhất cho bàn chơi này."
        open={help}
        onOpenChange={setHelp}
      >
        <RulesHelp rules={state?.rules ?? defaultRules} />
      </Modal>
      <Modal
        title="Tùy chỉnh luật"
        description="Thay đổi luật sẽ hủy trạng thái sẵn sàng để mọi người xác nhận lại."
        open={editing}
        onOpenChange={setEditing}
      >
        <RulesFields rules={rules} onChange={setRules} disabled={busy} />
        <AsyncButton
          variant="primary"
          disabled={busy}
          onClick={async () => {
            await game.send({ action: 'settings', rules });
            setEditing(false);
          }}
        >
          Lưu luật chơi
        </AsyncButton>
      </Modal>
    </section>
  );
}

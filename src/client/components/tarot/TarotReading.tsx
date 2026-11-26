import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Moon, Shuffle, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Snapshot } from '../../../shared/contracts';
import { deck } from '../../../shared/tarot/deck';
import {
  interpret,
  QUESTION_MAX,
  spreads,
  spreadSize,
  TAROT_FLIP_MS,
  TAROT_SHUFFLE_MS,
  tarotCommandSchema,
  topics,
  type TarotCommand,
  type TarotLine,
  type TarotReading as Reading,
  type TarotSnapshot,
  type TarotSpread,
  type TarotTopic,
} from '../../../shared/tarot/contracts';
import { isConnectionError } from '../../../shared/auth-errors';
import { api, supabase } from '../../lib/api';
import { RealtimeService } from '../../lib/realtime';
import { Button, Loading, Modal } from '../ui';
import { TarotAiText } from './TarotAiText';
import { TarotCardBack, TarotCardFace } from './TarotArt';
// The room layout for full-width tools (.wheel-screen) lives with the lucky wheel.
import '../lucky-wheel.css';
import './tarot.css';

type Pending = { key: string; command: TarotCommand };
type Draft = { spread: TarotSpread; topic: TarotTopic; question: string };
type Mode = 'view' | 'shuffle' | 'pick';
/** The whole deck is laid out face down to pick from. */
const FAN_SIZE = 78;
const SHUFFLE_UI_MS = 1300;

function readStored<T>(key: string, parse: (value: unknown) => T | null): T | null {
  try {
    return parse(JSON.parse(sessionStorage.getItem(key) ?? 'null'));
  } catch {
    return null;
  }
}
function writeStored(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage is optional */
  }
}
const parseDraft = (value: unknown): Draft | null => {
  const v = value as Draft | null;
  return v && v.spread in spreads && v.topic in topics && typeof v.question === 'string'
    ? { ...v, question: v.question.slice(0, QUESTION_MAX) }
    : null;
};
const parsePending = (value: unknown): Pending | null => {
  const v = value as Pending | null;
  if (!v || !/^[\da-f-]{36}$/i.test(v.key)) return null;
  const command = tarotCommandSchema.safeParse(v.command);
  return command.success ? { key: v.key, command: command.data } : null;
};
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Milliseconds after the reading was created when card `i` turns face up. */
const flipAt = (i: number) => TAROT_SHUFFLE_MS + i * TAROT_FLIP_MS;

function CardZoom({ line, onClose }: { line: TarotLine | null; onClose: () => void }) {
  return (
    <Modal
      open={line !== null}
      onOpenChange={(open) => !open && onClose()}
      title={line ? `${line.card.name}${line.reversed ? ' (ngược)' : ''}` : 'Lá bài'}
      description={
        line
          ? `${line.position} · ${line.card.keywords[line.reversed ? 'reversed' : 'upright']}`
          : ''
      }
      className="tarot-zoom"
    >
      {line && (
        <div className="tarot-zoom-body">
          <div className={'tarot-zoom-card' + (line.reversed ? ' reversed' : '')}>
            <TarotCardFace card={line.card} />
          </div>
          <div>
            <p>{line.meaning}</p>
            {line.advice && <p className="tarot-advice">{line.advice}</p>}
            <p className="tarot-zoom-other">
              <b>{line.reversed ? 'Khi xuôi:' : 'Khi ngược:'}</b>{' '}
              {line.reversed ? line.card.upright : line.card.reversed}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Spread({
  reading,
  now,
  ai,
}: {
  reading: Reading;
  now: number;
  /** The long AI reading, shown once every card is face up. */
  ai: ReactNode;
}) {
  const [zoom, setZoom] = useState<number | null>(null);
  const elapsed = now - Date.parse(reading.created_at);
  const gathering = elapsed < TAROT_SHUFFLE_MS;
  const result = interpret(reading);
  const roles = spreads[reading.spread].roles;
  const done = elapsed >= flipAt(reading.cards.length - 1);
  return (
    <>
      <div
        className={'tarot-spread' + (gathering ? ' gathering' : '')}
        data-count={reading.cards.length}
      >
        {result.lines.map((line, i) => {
          const open = elapsed >= flipAt(i);
          const label = open
            ? `${line.position}: ${line.card.name}${line.reversed ? ' (ngược)' : ''}`
            : 'Lá bài úp';
          return (
            <figure className="tarot-slot" key={i} style={{ '--i': i } as CSSProperties}>
              <figcaption>
                <b>{line.position}</b>
                {reading.cards.length > 1 && <small>{roles[i]}</small>}
              </figcaption>
              <button
                type="button"
                className={
                  'tarot-card' + (open ? ' open' : '') + (line.reversed ? ' reversed' : '')
                }
                aria-label={label}
                disabled={!open}
                onClick={() => setZoom(i)}
              >
                <span className="tarot-card-inner" aria-hidden="true">
                  <span className="tarot-back">
                    <TarotCardBack />
                  </span>
                  <span className="tarot-front">
                    <TarotCardFace card={line.card} />
                  </span>
                </span>
              </button>
              <span
                className={'tarot-orientation' + (line.reversed ? ' rev' : '')}
                aria-hidden={!open}
              >
                {open ? (line.reversed ? 'Ngược' : 'Xuôi') : ' '}
              </span>
            </figure>
          );
        })}
      </div>
      <div className="tarot-reading" aria-live="polite">
        {done && (result.answer || result.flow) && (
          <div className="tarot-verdict">
            {result.answer && <strong className="tarot-answer">{result.answer}</strong>}
            {result.flow && (
              <>
                <span className="tarot-flow-label">Dòng chảy năng lượng</span>
                <strong className="tarot-flow">{result.flow.name}</strong>
              </>
            )}
          </div>
        )}
        {done && ai}
        {result.lines.map(
          (line, i) =>
            elapsed >= flipAt(i) && (
              <article key={i} className="tarot-meaning">
                <button
                  type="button"
                  className="tarot-thumb"
                  onClick={() => setZoom(i)}
                  aria-label={`Xem lớn ${line.card.name}`}
                >
                  <span className={line.reversed ? 'reversed' : ''}>
                    <TarotCardFace card={line.card} />
                  </span>
                </button>
                <div>
                  <h4>
                    <span>{line.position}</span> {line.card.name}
                    {line.reversed && <em> · ngược</em>}
                  </h4>
                  <p className="tarot-keywords">
                    {line.reversed ? line.card.keywords.reversed : line.card.keywords.upright}
                  </p>
                  <p>{line.meaning}</p>
                  {line.advice && <p className="tarot-advice">{line.advice}</p>}
                </div>
              </article>
            ),
        )}
        {done && result.summary && (
          <div className="tarot-summary">
            <Sparkles size={16} aria-hidden="true" />
            <p>{result.summary}</p>
          </div>
        )}
      </div>
      <CardZoom line={zoom === null ? null : result.lines[zoom]} onClose={() => setZoom(null)} />
    </>
  );
}

function Fan({
  need,
  chosen,
  locked,
  onPick,
}: {
  need: number;
  chosen: number[];
  locked: boolean;
  onPick: (i: number) => void;
}) {
  return (
    <div className="tarot-fan-wrap">
      <p className="tarot-fan-hint" role="status">
        {locked
          ? 'Đang mở bài…'
          : `Hít một hơi, nghĩ về câu hỏi và chọn ${need} lá theo trực giác (${chosen.length}/${need})`}
      </p>
      <div className="tarot-fan" role="group" aria-label="Bộ bài đã trải">
        {Array.from({ length: FAN_SIZE }, (_, i) => {
          const order = chosen.indexOf(i);
          return (
            <button
              key={i}
              type="button"
              className={'tarot-fan-card' + (order >= 0 ? ' chosen' : '')}
              style={{ '--i': i } as CSSProperties}
              aria-label={`Lá úp thứ ${i + 1}`}
              aria-pressed={order >= 0}
              disabled={locked || (order < 0 && chosen.length >= need)}
              onClick={() => onPick(i)}
            >
              <TarotCardBack />
              {order >= 0 && <b className="tarot-fan-order">{order + 1}</b>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Shuffling() {
  return (
    <div className="tarot-shuffle" role="status" aria-label="Đang xào bài">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} style={{ '--s': i } as CSSProperties}>
          <TarotCardBack />
        </span>
      ))}
      <p>Đang xào bài…</p>
    </div>
  );
}

export default function TarotReading({ snapshot }: { snapshot: Snapshot }) {
  const room = snapshot.room.id,
    actor = snapshot.me;
  const client = useQueryClient();
  const key = ['tarot', room, actor];
  const storage = `roomtune:tarot:${room}:${actor}`;
  const [pending, setPending] = useState<Pending | null>(() => readStored(storage, parsePending));
  const [draft, setDraft] = useState<Draft>(
    () =>
      readStored(`${storage}:draft`, parseDraft) ?? {
        spread: 'THREE',
        topic: 'GENERAL',
        question: '',
      },
  );
  // An older reading picked from history; a newer reading in the room takes the stage again.
  const [picked, setPicked] = useState<{ id: string; over: string | null } | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [chosen, setChosen] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<TarotSnapshot>(`/rooms/${room}/tarot`, undefined, undefined, actor),
    staleTime: 2000,
    refetchInterval: 5000,
    retry: false,
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const refresh = () => void client.invalidateQueries({ queryKey: ['tarot', room, actor] });
    return new RealtimeService(supabase).subscribeChat(room, actor, {
      onVersion: refresh,
      onResync: refresh,
    });
  }, [room, actor, client]);
  useEffect(() => {
    if (mode !== 'shuffle') return;
    const timer = setTimeout(() => setMode('pick'), reducedMotion() ? 0 : SHUFFLE_UI_MS);
    return () => clearTimeout(timer);
  }, [mode]);
  const data = query.data;
  const latest = data?.latest ?? null;
  const viewing = picked && picked.over === (latest?.id ?? null) ? picked.id : null;
  const setViewing = (id: string | null) => setPicked(id ? { id, over: latest?.id ?? null } : null);
  const serverNow = now + (snapshot.clock_offset_ms ?? 0);
  const shown = (viewing && data?.recent.find((r) => r.id === viewing)) || latest;
  const drawing = Boolean(latest && serverNow < Date.parse(latest.reveal_at));
  const cooldown = Math.max(
    0,
    Math.ceil(((data?.my_next_at ? Date.parse(data.my_next_at) : 0) - serverNow) / 1000),
  );
  const command = { action: 'draw' as const, ...draft };
  const valid = tarotCommandSchema.safeParse(command);
  const need = spreadSize[draft.spread];
  function update(change: Partial<Draft>) {
    const next = { ...draft, ...change };
    setDraft(next);
    writeStored(`${storage}:draft`, next);
    if (change.spread && change.spread !== draft.spread) setChosen([]);
  }
  function savePending(value: Pending | null) {
    setPending(value);
    writeStored(storage, value);
  }
  async function draw(request: Pending) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    savePending(request);
    try {
      const result = await api<Reading>(
        `/rooms/${room}/tarot`,
        request.command,
        request.key,
        actor,
      );
      savePending(null);
      setViewing(null);
      setMode('view');
      setChosen([]);
      stage.current?.scrollIntoView({
        block: 'start',
        behavior: reducedMotion() ? 'instant' : 'smooth',
      });
      client.setQueryData<TarotSnapshot>(key, (current) =>
        current &&
        (!current.latest || Date.parse(result.created_at) >= Date.parse(current.latest.created_at))
          ? {
              ...current,
              latest: result,
              recent: [result, ...current.recent.filter((r) => r.id !== result.id)],
            }
          : current,
      );
      await client.invalidateQueries({ queryKey: key });
    } catch (error) {
      if (!isConnectionError(error)) {
        savePending(null);
        setChosen([]);
        setMode('view');
      }
      toast.error(error instanceof Error ? error.message : 'Chưa rút được bài. Hãy thử lại.');
      void query.refetch();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function pick(i: number) {
    if (busy) return;
    const next = chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i];
    setChosen(next);
    if (next.length === need && valid.success)
      // Let the last chosen card lift before the cards are revealed.
      setTimeout(() => void draw({ key: crypto.randomUUID(), command: valid.data }), 450);
  }
  const canStart = !query.error && valid.success && cooldown === 0 && !drawing && !pending;
  if (query.isPending) return <Loading>Đang trải bài…</Loading>;
  const locked = busy || !!pending || mode !== 'view';
  return (
    <section className="tarot-panel" aria-label="Bói Tarot">
      <header className="lucky-heading">
        <span className="eyebrow">
          <Moon size={14} /> CHỈ ĐỂ GIẢI TRÍ
        </span>
        <h1>
          Bói Tarot<span>.</span>
        </h1>
        <p>Đặt một câu hỏi, tự tay chọn bài và cùng cả phòng đọc thông điệp.</p>
      </header>
      {query.error && (
        <div className="connection-banner" role="alert">
          {query.error.message} <Button onClick={() => void query.refetch()}>Kết nối lại</Button>
        </div>
      )}
      <div className="tarot-layout">
        <div className="tarot-stage" ref={stage}>
          <div className="tarot-sky" aria-hidden="true" />
          {mode === 'shuffle' ? (
            <Shuffling />
          ) : mode === 'pick' ? (
            <>
              <Fan
                need={need}
                chosen={chosen}
                locked={busy || chosen.length === need}
                onPick={pick}
              />
              <Button
                className="tarot-cancel"
                disabled={busy}
                onClick={() => {
                  setMode('view');
                  setChosen([]);
                }}
              >
                <X size={16} /> Thôi, không rút nữa
              </Button>
            </>
          ) : shown ? (
            <>
              <div className="tarot-stage-caption">
                <Sparkles size={15} aria-hidden="true" />
                <span>
                  <b>{shown.actor_name}</b> · {spreads[shown.spread].label} · {topics[shown.topic]}
                </span>
              </div>
              {shown.question && (
                <blockquote className="tarot-question">“{shown.question}”</blockquote>
              )}
              <Spread
                key={shown.id}
                reading={shown}
                now={shown.id === latest?.id ? serverNow : Number.POSITIVE_INFINITY}
                ai={
                  <TarotAiText
                    reading={shown}
                    room={room}
                    me={actor}
                    now={serverNow}
                    onChange={() => void client.invalidateQueries({ queryKey: key })}
                  />
                }
              />
              {viewing && latest && viewing !== latest.id && (
                <Button className="tarot-back-latest" onClick={() => setViewing(null)}>
                  Về lượt rút mới nhất
                </Button>
              )}
            </>
          ) : (
            <div className="tarot-empty">
              <div className="tarot-deck-stack" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i}>
                    <TarotCardBack />
                  </span>
                ))}
              </div>
              <strong>Bộ bài 78 lá đang chờ.</strong>
              <p>Chọn kiểu trải bài, đặt câu hỏi rồi bấm Xào bài.</p>
            </div>
          )}
        </div>
        <div className="tarot-controls panel">
          <h3>Bạn muốn hỏi gì?</h3>
          <div className="tarot-choice" role="group" aria-label="Kiểu trải bài">
            {(Object.keys(spreads) as TarotSpread[]).map((id) => (
              <Button
                key={id}
                aria-pressed={draft.spread === id}
                disabled={locked}
                onClick={() => update({ spread: id })}
              >
                <b>{spreads[id].label}</b>
                <small>{spreads[id].hint}</small>
              </Button>
            ))}
          </div>
          <div className="tarot-topics" role="group" aria-label="Chủ đề">
            {(Object.keys(topics) as TarotTopic[]).map((id) => (
              <Button
                key={id}
                aria-pressed={draft.topic === id}
                disabled={locked}
                onClick={() => update({ topic: id })}
              >
                {topics[id]}
              </Button>
            ))}
          </div>
          <label className="tarot-question-field">
            Câu hỏi {draft.spread === 'YES_NO' ? '(bắt buộc)' : '(không bắt buộc)'}
            <textarea
              aria-label="Câu hỏi"
              rows={3}
              maxLength={QUESTION_MAX}
              value={draft.question}
              disabled={locked}
              placeholder={
                draft.spread === 'YES_NO'
                  ? 'Tuần này mình có nên nhận lời mời làm việc mới không?'
                  : 'Mình nên làm gì để mọi việc tốt hơn?'
              }
              onChange={(event) => update({ question: event.target.value })}
            />
            <small>
              {draft.question.length}/{QUESTION_MAX} · Mẹo: câu hỏi “làm thế nào” cho lời khuyên rõ
              hơn câu hỏi “có hay không”. Câu hỏi hiện cho cả phòng xem.
            </small>
          </label>
          {draft.question.trim() !== '' && !valid.success && (
            <p className="lucky-validation" role="alert">
              {valid.error.issues[0].message}
            </p>
          )}
          {pending && !busy && (
            <p className="lucky-note">
              Lượt rút chưa được xác nhận. Thử lại sẽ kiểm tra đúng lượt đó, không rút hai lần.
            </p>
          )}
          {pending ? (
            <Button
              variant="primary"
              className="tarot-draw-button"
              loading={busy}
              loadingLabel="Đang mở bài…"
              onClick={() => void draw(pending)}
            >
              <Sparkles size={19} /> Xác nhận lại lượt rút
            </Button>
          ) : (
            <Button
              variant="primary"
              className="tarot-draw-button"
              loading={busy}
              loadingLabel="Đang mở bài…"
              disabled={!canStart || mode !== 'view'}
              onClick={() => {
                setChosen([]);
                setViewing(null);
                setMode('shuffle');
              }}
            >
              <Shuffle size={19} />
              {mode === 'shuffle'
                ? 'Đang xào bài…'
                : mode === 'pick'
                  ? `Chọn ${need - chosen.length} lá nữa`
                  : drawing
                    ? 'Đang lật bài…'
                    : cooldown
                      ? `Rút tiếp sau ${cooldown}s`
                      : 'Xào bài'}
            </Button>
          )}
          <small>
            Lá bài do máy chủ trộn và mở, ai trong phòng cũng thấy cùng một kết quả. Mỗi người rút
            một lượt / 20 giây.
          </small>
        </div>
      </div>
      {Boolean(data?.recent.length) && (
        <details className="lucky-history tarot-history">
          <summary>
            <History size={16} /> Những lượt rút gần đây
          </summary>
          <ol>
            {data?.recent.map((item) => (
              <li key={item.id}>
                <button
                  className={item.id === shown?.id ? 'active' : ''}
                  onClick={() => {
                    setMode('view');
                    setViewing(item.id);
                  }}
                  disabled={item.id === latest?.id && drawing}
                >
                  <span>
                    <b>{item.actor_name}</b>
                    {item.question ? ` · “${item.question}”` : ''}
                  </span>
                  <small>
                    {item.id === latest?.id && drawing
                      ? 'Đang lật bài…'
                      : item.cards
                          .map((c) => deck[c.card].name + (c.reversed ? ' (ngược)' : ''))
                          .join(', ')}{' '}
                    · {new Date(item.created_at).toLocaleTimeString('vi-VN')}
                  </small>
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

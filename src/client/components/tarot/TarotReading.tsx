import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Moon, Sparkles, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Snapshot } from '../../../shared/contracts';
import { deck } from '../../../shared/tarot/deck';
import {
  interpret,
  QUESTION_MAX,
  spreads,
  TAROT_FLIP_MS,
  TAROT_SHUFFLE_MS,
  tarotCommandSchema,
  topics,
  type TarotCommand,
  type TarotReading as Reading,
  type TarotSnapshot,
  type TarotSpread,
  type TarotTopic,
} from '../../../shared/tarot/contracts';
import { isConnectionError } from '../../../shared/auth-errors';
import { api, supabase } from '../../lib/api';
import { RealtimeService } from '../../lib/realtime';
import { Button, Loading } from '../ui';
import { TarotCardFace } from './TarotCardFace';
// The room layout for full-width tools (.wheel-screen) lives with the lucky wheel.
import '../lucky-wheel.css';
import './tarot.css';

type Pending = { key: string; command: TarotCommand };
type Draft = { spread: TarotSpread; topic: TarotTopic; question: string };
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

/** Milliseconds after the reading was created when card `i` turns face up. */
const flipAt = (i: number) => TAROT_SHUFFLE_MS + i * TAROT_FLIP_MS;

function Spread({ reading, now }: { reading: Reading; now: number }) {
  const elapsed = now - Date.parse(reading.created_at);
  const shuffling = elapsed < TAROT_SHUFFLE_MS;
  const result = interpret(reading);
  const positions = spreads[reading.spread].positions;
  return (
    <div
      className={'tarot-spread' + (shuffling ? ' shuffling' : '')}
      data-count={reading.cards.length}
    >
      {reading.cards.map(({ card, reversed }, i) => {
        const open = elapsed >= flipAt(i);
        const c = deck[card];
        return (
          <figure className="tarot-slot" key={i}>
            <figcaption>{positions[i]}</figcaption>
            <div
              className={'tarot-card' + (open ? ' open' : '') + (reversed ? ' reversed' : '')}
              role="img"
              aria-label={
                open ? `${positions[i]}: ${c.name}${reversed ? ' (ngược)' : ''}` : 'Lá bài úp'
              }
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="tarot-card-inner">
                <div className="tarot-back" aria-hidden="true">
                  <Moon size={30} />
                </div>
                <div className="tarot-front" aria-hidden="true">
                  <TarotCardFace card={c} />
                </div>
              </div>
            </div>
            {open && (
              <span className={'tarot-orientation' + (reversed ? ' rev' : '')}>
                {reversed ? 'Ngược' : 'Xuôi'}
              </span>
            )}
          </figure>
        );
      })}
      <div className="tarot-meanings" aria-live="polite">
        {result.lines.map(
          (line, i) =>
            elapsed >= flipAt(i) && (
              <article key={i} className="tarot-meaning">
                <h4>
                  <span>{line.position}</span> {line.card.name}
                  {line.reversed && <em> · ngược</em>}
                </h4>
                <p className="tarot-keywords">
                  {line.reversed ? line.card.keywords.reversed : line.card.keywords.upright}
                </p>
                <p>{line.meaning}</p>
                {line.advice && <p className="tarot-advice">{line.advice}</p>}
              </article>
            ),
        )}
        {elapsed >= flipAt(reading.cards.length - 1) && (
          <div className="tarot-summary">
            {result.answer && <strong className="tarot-answer">{result.answer}</strong>}
            <p>{result.summary}</p>
          </div>
        )}
      </div>
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
  function update(change: Partial<Draft>) {
    const next = { ...draft, ...change };
    setDraft(next);
    writeStored(`${storage}:draft`, next);
  }
  function savePending(value: Pending | null) {
    setPending(value);
    writeStored(storage, value);
  }
  async function draw() {
    if (working.current) return;
    if (!pending && (!valid.success || cooldown || drawing)) return;
    const request = pending ?? { key: crypto.randomUUID(), command: valid.data! };
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
      stage.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
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
      if (!isConnectionError(error)) savePending(null);
      toast.error(error instanceof Error ? error.message : 'Chưa rút được bài. Hãy thử lại.');
      void query.refetch();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  if (query.isPending) return <Loading>Đang trải bài…</Loading>;
  const locked = busy || !!pending;
  return (
    <section className="tarot-panel" aria-label="Bói Tarot">
      <header className="lucky-heading">
        <span className="eyebrow">
          <Moon size={14} /> CHỈ ĐỂ GIẢI TRÍ
        </span>
        <h1>
          Bói Tarot<span>.</span>
        </h1>
        <p>Đặt một câu hỏi, rút vài lá bài và cùng cả phòng đọc thông điệp.</p>
      </header>
      {query.error && (
        <div className="connection-banner" role="alert">
          {query.error.message} <Button onClick={() => void query.refetch()}>Kết nối lại</Button>
        </div>
      )}
      <div className="tarot-layout">
        <div className="tarot-stage" ref={stage}>
          {shown ? (
            <>
              <div className="tarot-stage-caption">
                <Sparkles size={15} />
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
                now={shown.id === latest?.id ? serverNow : Infinity}
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
                <span />
                <span />
                <span />
              </div>
              <strong>Bộ bài 78 lá đang chờ.</strong>
              <p>Chọn kiểu trải bài bên cạnh rồi rút lá đầu tiên của phòng.</p>
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
                  ? 'Tuần này mình có nên đổi việc không?'
                  : 'Điều gì đang chờ mình phía trước?'
              }
              onChange={(event) => update({ question: event.target.value })}
            />
            <small>
              {draft.question.length}/{QUESTION_MAX} · Câu hỏi hiện cho cả phòng xem.
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
          <Button
            variant="primary"
            className="tarot-draw-button"
            loading={busy}
            loadingLabel="Đang trộn bài…"
            onClick={() => void draw()}
            disabled={!pending && (!!query.error || !valid.success || cooldown > 0 || drawing)}
          >
            <Wand2 size={19} />
            {pending
              ? 'Xác nhận lại lượt rút'
              : drawing
                ? 'Đang lật bài…'
                : cooldown
                  ? `Rút tiếp sau ${cooldown}s`
                  : 'Rút bài'}
          </Button>
          <small>
            Bài được trộn và rút trên máy chủ, ai cũng thấy cùng một kết quả. Mỗi người rút một lượt
            / 20 giây.
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
                  onClick={() => setViewing(item.id)}
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

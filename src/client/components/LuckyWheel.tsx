import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDot, Gift, List, RotateCw, Sparkles, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Snapshot } from '../../shared/contracts';
import {
  wheelCommandSchema,
  wheelRewards,
  type WheelCommand,
  type WheelResult,
  type WheelSnapshot,
  type WheelReward,
} from '../../shared/wheel';
import { isConnectionError } from '../../shared/auth-errors';
import { api, supabase } from '../lib/api';
import { RealtimeService } from '../lib/realtime';
import { Button, Loading } from './ui';
import './lucky-wheel.css';

type PendingSpin = { key: string; command: WheelCommand };
type Draft = { mode: 'MEMBERS' | 'CUSTOM'; withReward: boolean; reward: WheelReward; text: string };
function readDraft(key: string): Draft {
  const defaults: Draft = { mode: 'MEMBERS', withReward: false, reward: 'LATEST_FIRST', text: '' };
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      value &&
      ['MEMBERS', 'CUSTOM'].includes(value.mode) &&
      typeof value.withReward === 'boolean' &&
      ['LATEST_FIRST', 'TWO_FIRST'].includes(value.reward) &&
      typeof value.text === 'string'
    )
      return { ...value, text: value.text.slice(0, 3050) };
  } catch {
    /* storage is optional */
  }
  return defaults;
}
function readPending(key: string): PendingSpin | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (value && /^[\da-f-]{36}$/i.test(value.key))
      return { key: value.key, command: wheelCommandSchema.parse(value.command) };
  } catch {
    /* unavailable storage or obsolete draft */
  }
  return null;
}
const colors = ['#b89bfa', '#677cce', '#edab77', '#5baaa0', '#cb7bb9', '#7a73a6'];
function WheelDisc({
  result,
  labels,
  now,
}: {
  result: WheelResult | null;
  labels: string[];
  now: number;
}) {
  const [angle, setAngle] = useState(0);
  const [duration, setDuration] = useState(0);
  const entries = result?.choices.map((choice) => choice.label) ?? labels;
  const count = Math.max(2, entries.length);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (!result) return;
    const remaining = Math.max(0, Date.parse(result.reveal_at) - now);
    const target = 360 - (result.winner_index + 0.5) * (360 / result.choices.length);
    const frame = requestAnimationFrame(() => {
      setDuration(reduced ? 0 : remaining);
      setAngle(target + (remaining > 0 && !reduced ? 1800 : 0));
    });
    return () => cancelAnimationFrame(frame);
    // One animation per committed result; polling must never restart a spin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id, reduced]);
  const wedges = Array.from(
    { length: count },
    (_, i) => `${colors[i % colors.length]} ${(i * 360) / count}deg ${((i + 1) * 360) / count}deg`,
  ).join(',');
  return (
    <div className="lucky-disc-wrap" aria-hidden="true">
      <span className="lucky-pointer" />
      <div
        className="lucky-disc"
        style={{
          background: `conic-gradient(${wedges})`,
          transform: `rotate(${angle}deg)`,
          transitionDuration: `${duration}ms`,
        }}
      >
        {entries.length <= 16 &&
          entries.map((label, index) => (
            <span
              className="lucky-wedge-label"
              key={index}
              style={{ '--angle': `${((index + 0.5) * 360) / count}deg` } as CSSProperties}
            >
              <b>{label.slice(0, 19)}</b>
            </span>
          ))}
      </div>
      <div className="lucky-hub">
        <Sparkles size={18} />
      </div>
      <div className="lucky-disc-shadow" />
    </div>
  );
}
export default function LuckyWheel({ snapshot }: { snapshot: Snapshot }) {
  const room = snapshot.room.id,
    actor = snapshot.me;
  const client = useQueryClient();
  const key = ['wheel', room, actor];
  const storage = `roomtune:wheel:${room}:${actor}`;
  const [pending, setPending] = useState<PendingSpin | null>(() => readPending(storage));
  const [draft, setDraft] = useState(() => readDraft(`${storage}:draft`));
  const { mode, withReward, reward, text } = draft;
  const [previewUntil, setPreviewUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<WheelSnapshot>(`/rooms/${room}/wheel`, undefined, undefined, actor),
    staleTime: 2000,
    refetchInterval: 5000,
    retry: false,
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['wheel', room, actor] });
    };
    return new RealtimeService(supabase).subscribeChat(room, actor, {
      onVersion: refresh,
      onResync: refresh,
    });
  }, [room, actor, client]);
  const data = query.data;
  const selectedReward = mode === 'MEMBERS' && withReward ? reward : 'NONE';
  const labels = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const eligible =
    data?.online.filter((member) => selectedReward === 'NONE' || member.queued > 0) ?? [];
  const choices = mode === 'MEMBERS' ? eligible.map((member) => member.label) : labels;
  const latest = data?.latest ?? null;
  const serverNow = now + (snapshot.clock_offset_ms ?? 0);
  const spinning = Boolean(latest && serverNow < Date.parse(latest.reveal_at));
  const displayedResult = latest && (spinning || previewUntil !== latest.id) ? latest : null;
  function updateDraft(change: Partial<Draft>) {
    const next = { ...draft, ...change };
    setDraft(next);
    setPreviewUntil(latest?.id ?? null);
    try {
      sessionStorage.setItem(`${storage}:draft`, JSON.stringify(next));
    } catch {
      /* retain the draft in memory if storage is unavailable */
    }
  }
  const cooldown = Math.max(
    0,
    Math.ceil(((latest ? Date.parse(latest.next_spin_at) : 0) - serverNow) / 1000),
  );
  const online = data?.online.some((member) => member.id === actor) ?? false;
  const command: WheelCommand = {
    action: 'spin',
    mode,
    reward: selectedReward,
    labels: mode === 'CUSTOM' ? labels : [],
    previous_id: latest?.id ?? null,
  };
  const valid = wheelCommandSchema.safeParse(command);
  function savePending(value: PendingSpin | null) {
    setPending(value);
    try {
      if (value) sessionStorage.setItem(storage, JSON.stringify(value));
      else sessionStorage.removeItem(storage);
    } catch {
      /* in-memory request still has a stable key */
    }
  }
  async function spin() {
    if (working.current) return;
    const request = pending ?? {
      key: crypto.randomUUID(),
      command: valid.success ? valid.data : command,
    };
    if (!pending && (!valid.success || choices.length < 2 || !online || cooldown)) return;
    working.current = true;
    setBusy(true);
    savePending(request);
    try {
      const result = await api<WheelResult>(
        `/rooms/${room}/wheel`,
        request.command,
        request.key,
        actor,
      );
      savePending(null);
      stage.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
      client.setQueryData<WheelSnapshot>(key, (current) =>
        current &&
        (!current.latest || Date.parse(result.created_at) >= Date.parse(current.latest.created_at))
          ? { ...current, latest: result }
          : current,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: ['room', room] }),
      ]);
    } catch (error) {
      if (!isConnectionError(error)) savePending(null);
      toast.error(error instanceof Error ? error.message : 'Chưa quay được. Hãy thử lại.');
      void query.refetch();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  if (query.isPending) return <Loading>Đang mở vòng quay…</Loading>;
  return (
    <section className="lucky-panel" aria-label="Vòng quay may mắn">
      <header className="lucky-heading">
        <span className="eyebrow">
          <Sparkles size={14} /> MỘT CHÚT BẤT NGỜ
        </span>
        <h1>
          Vòng quay may mắn<span>.</span>
        </h1>
        <p>Chọn một người. Chốt một ý tưởng. Để vận may lên tiếng.</p>
      </header>
      {query.error && (
        <div className="connection-banner" role="alert">
          {query.error.message} <Button onClick={() => void query.refetch()}>Kết nối lại</Button>
        </div>
      )}
      <div className="lucky-layout">
        <div className="lucky-stage" ref={stage}>
          <div className="lucky-stage-caption">
            <CircleDot size={16} />{' '}
            {spinning
              ? 'Vòng quay của cả phòng'
              : `${displayedResult?.choices.length ?? choices.length} lựa chọn · ${displayedResult ? 'Lượt quay gần nhất' : 'Cơ hội như nhau'}`}
          </div>
          <WheelDisc
            key={displayedResult?.id ?? 'preview'}
            result={displayedResult}
            labels={choices}
            now={serverNow}
          />
          <div className="lucky-result" aria-live="polite" role="status">
            {spinning ? (
              <>
                <RotateCw className="spin" size={19} />
                <strong>Vận may đang ghé thăm…</strong>
              </>
            ) : latest ? (
              <>
                <Trophy size={23} />
                <span>KẾT QUẢ GẦN NHẤT</span>
                <h3>{latest.winner.label}</h3>
                <p>{wheelRewards[latest.reward].label}</p>
                {latest.rewarded.length > 0 && (
                  <ul>
                    {latest.rewarded.map((song) => (
                      <li key={song.id}>{song.title}</li>
                    ))}
                  </ul>
                )}
                {latest.rewarded.length > 0 && (
                  <small>Đã ưu tiên trực tiếp. Bài đang phát vẫn tiếp tục.</small>
                )}
              </>
            ) : (
              <>
                <Sparkles size={23} />
                <strong>Ai, hay điều gì, sẽ được chọn?</strong>
                <p>Chọn cách quay ở bên cạnh để bắt đầu.</p>
              </>
            )}
          </div>
        </div>
        <div className="lucky-controls panel">
          <h3>Hôm nay quay gì?</h3>
          <div className="lucky-mode" role="group" aria-label="Loại vòng quay">
            <Button
              aria-pressed={mode === 'MEMBERS'}
              onClick={() => updateDraft({ mode: 'MEMBERS' })}
              disabled={busy || !!pending}
            >
              <Users size={18} /> Thành viên
            </Button>
            <Button
              aria-pressed={mode === 'CUSTOM'}
              onClick={() => updateDraft({ mode: 'CUSTOM' })}
              disabled={busy || !!pending}
            >
              <List size={18} /> Tự nhập
            </Button>
          </div>
          {mode === 'CUSTOM' ? (
            <label className="lucky-custom-label">
              Các lựa chọn, mỗi dòng một mục
              <textarea
                aria-label="Danh sách lựa chọn"
                value={text}
                maxLength={3050}
                rows={5}
                disabled={busy || !!pending}
                onChange={(event) => updateDraft({ text: event.target.value })}
                placeholder={'Bún bò\nPhở\nCơm tấm'}
              />
              <small>
                Món ăn, địa điểm, công việc… 2–50 mục khác nhau, tối đa 60 ký tự/mục. Không gắn
                thưởng nhạc.
              </small>
            </label>
          ) : (
            <>
              <label className="lucky-reward-toggle">
                <input
                  type="checkbox"
                  checked={withReward}
                  disabled={busy || !!pending}
                  onChange={(event) => updateDraft({ withReward: event.target.checked })}
                />
                <Gift size={19} /> Có phần thưởng nhạc
              </label>
              {withReward && (
                <label>
                  Phần thưởng
                  <select
                    aria-label="Chọn phần thưởng"
                    value={reward}
                    disabled={busy || !!pending}
                    onChange={(event) => updateDraft({ reward: event.target.value as WheelReward })}
                  >
                    {Object.entries(wheelRewards)
                      .filter(([id]) => id !== 'NONE')
                      .map(([id, item]) => (
                        <option value={id} key={id}>
                          {item.label}
                        </option>
                      ))}
                  </select>
                  <small>
                    {wheelRewards[reward].description} Áp dụng trực tiếp, không cần biểu quyết,
                    không cắt bài đang phát.
                  </small>
                </label>
              )}
              <p className="lucky-note">
                {withReward
                  ? 'Chỉ tính người online có bài đã được duyệt và đang chờ.'
                  : 'Mọi thành viên đang online đều có thể quay và được chọn. Nhiều tab chỉ tính một người.'}
              </p>
            </>
          )}
          <div className="lucky-participants" aria-label="Các lựa chọn hiện tại">
            <strong>{choices.length} lựa chọn</strong>
            <div tabIndex={0} aria-label="Cuộn danh sách lựa chọn">
              {choices.map((label, i) => (
                <span key={i}>
                  <i>{i + 1}</i>
                  {label}
                </span>
              ))}
            </div>
          </div>
          {mode === 'CUSTOM' && labels.length > 0 && !valid.success && (
            <p className="lucky-validation" role="alert">
              {valid.error.issues[0].message}
            </p>
          )}
          {!online && <p className="lucky-note">Đang xác nhận bạn online trong phòng…</p>}
          {pending && !busy && (
            <p className="lucky-note">
              Lượt quay chưa được xác nhận. Thử lại sẽ kiểm tra cùng một lượt, không trao thưởng hai
              lần.
            </p>
          )}
          <Button
            variant="primary"
            className="lucky-spin-button"
            loading={busy}
            loadingLabel="Đang xác nhận lượt quay…"
            onClick={() => void spin()}
            disabled={
              !pending &&
              (!!query.error || !online || cooldown > 0 || choices.length < 2 || !valid.success)
            }
          >
            <RotateCw size={19} />
            {pending
              ? 'Xác nhận lại lượt quay'
              : cooldown
                ? `Quay tiếp sau ${cooldown}s`
                : 'Quay may mắn'}
          </Button>
          <small>
            Mỗi phòng một lượt / 10 giây. Kết quả chung được lưu, tải lại trang vẫn xem được.
          </small>
        </div>
      </div>
      {Boolean(data?.recent.length) && (
        <details className="lucky-history">
          <summary>Những lượt quay gần đây</summary>
          <ol>
            {data?.recent.map((item) => (
              <li key={item.id}>
                <span>{item.id === latest?.id && spinning ? 'Đang quay…' : item.winner.label}</span>
                <small>
                  {item.mode === 'CUSTOM' ? 'Danh sách tự nhập' : wheelRewards[item.reward].label} ·{' '}
                  {new Date(item.created_at).toLocaleTimeString('vi-VN')}
                </small>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

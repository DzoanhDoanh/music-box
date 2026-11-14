import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpToLine, Check, Users, X, Minus } from 'lucide-react';
import { useFloatingVotePosition } from '../lib/floating-vote-position';
import './reorder-voting.css';
import type { QueueEntry, ReorderProposal, RoomCommand, Snapshot } from '../../shared/contracts';
import { Button, Modal } from './ui';

type Execute = (command: RoomCommand) => Promise<unknown>;
const outcomes: Record<ReorderProposal['status'], string> = {
  OPEN: 'Đang biểu quyết',
  APPLIED: 'Đã thông qua và chuyển bài',
  REJECTED: 'Đề xuất không được thông qua',
  CANCELLED: 'Đề xuất đã hủy',
  EXPIRED: 'Đã hết thời gian biểu quyết',
  STALE: 'Hàng chờ đã thay đổi — cần đề xuất lại',
};

export function ReorderVotePanel({ snapshot, execute }: { snapshot: Snapshot; execute: Execute }) {
  if (!snapshot.settings.reorder_approval) return null;
  return (
    <>
      <p className="reorder-help" tabIndex={-1}>
        {(snapshot.reorder?.online_count ?? 0) < 2
          ? 'Chưa đủ 2 người online. Hãy đợi thành viên khác hoặc nhờ chủ phòng tắt biểu quyết.'
          : 'Chọn “Đề xuất vị trí” cạnh bài hát. Cần quá nửa người online và ít nhất 2 người đồng ý.'}
      </p>
      {snapshot.reorder?.proposal && (
        <FloatingVote
          key={`${snapshot.me}:${snapshot.reorder.proposal.id}`}
          snapshot={snapshot}
          execute={execute}
        />
      )}
    </>
  );
}

function FloatingVote({ snapshot, execute }: { snapshot: Snapshot; execute: Execute }) {
  const proposal = snapshot.reorder!.proposal!;
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const ref = useFloatingVotePosition(minimized, dismissed);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (proposal.status !== 'OPEN') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [proposal.status]);
  const active =
    proposal.status === 'OPEN' &&
    Date.parse(proposal.expires_at) > now + (snapshot.clock_offset_ms ?? 0);
  const status = proposal.status === 'OPEN' && !active ? 'EXPIRED' : proposal.status;
  const changeSize = (small: boolean) => {
    setMinimized(small);
    // Only an explicit user action moves focus. Incoming proposals never steal it.
    requestAnimationFrame(() =>
      ref.current
        ?.querySelector<HTMLElement>(small ? '.vote-reminder' : '.reorder-voting')
        ?.focus({ preventScroll: true }),
    );
  };
  if (dismissed) return null;
  return createPortal(
    <div ref={ref} className="floating-vote" data-minimized={minimized}>
      <p className="sr-only" role="status" aria-atomic="true">
        {active
          ? `${proposal.requester} đề xuất đổi vị trí bài ${proposal.title}. ${proposal.yes_votes}/${proposal.required_votes} phiếu đồng ý.`
          : outcomes[status]}
      </p>
      <button hidden={!minimized} className="vote-reminder" onClick={() => changeSize(false)}>
        <Users size={22} aria-hidden="true" />
        <span>
          <strong>{active ? 'Biểu quyết đang chờ' : 'Kết quả biểu quyết'}</strong>
          <small>
            {proposal.yes_votes}/{proposal.required_votes} đồng ý · Nhấn để xem
          </small>
        </span>
        {active && proposal.eligible && proposal.my_vote === null && <span className="vote-dot" />}
      </button>
      <VoteContent
        hidden={minimized}
        snapshot={snapshot}
        execute={execute}
        controls={
          <Button
            variant="ghost"
            size="icon"
            aria-label={active ? 'Thu nhỏ biểu quyết' : 'Đóng biểu quyết'}
            onClick={() => {
              if (active) changeSize(true);
              else {
                setDismissed(true);
                document
                  .querySelector<HTMLElement>('.reorder-help')
                  ?.focus({ preventScroll: true });
              }
            }}
          >
            {active ? <Minus size={18} /> : <X size={18} />}
          </Button>
        }
      />
    </div>,
    document.body,
  );
}

function VoteContent({
  snapshot,
  execute,
  controls,
  hidden,
}: {
  snapshot: Snapshot;
  execute: Execute;
  controls?: ReactNode;
  hidden?: boolean;
}) {
  const proposal = snapshot.reorder?.proposal;
  const [clock, setClock] = useState(() => ({ proposalId: proposal?.id, now: Date.now() }));
  const now = clock.proposalId === proposal?.id ? clock.now : Date.now();
  const [pending, setPending] = useState<boolean | 'cancel' | null>(null);
  const running = useRef(false);
  useEffect(() => {
    if (proposal?.status !== 'OPEN') return;
    const timer = setInterval(() => setClock({ proposalId: proposal.id, now: Date.now() }), 1000);
    return () => clearInterval(timer);
  }, [proposal?.id, proposal?.status]);
  if (!snapshot.settings.reorder_approval) return null;
  const seconds = proposal
    ? Math.max(
        0,
        Math.ceil((Date.parse(proposal.expires_at) - now - (snapshot.clock_offset_ms ?? 0)) / 1000),
      )
    : 0;
  const status = proposal?.status === 'OPEN' && seconds === 0 ? 'EXPIRED' : proposal?.status;
  const vote = async (approved: boolean | 'cancel') => {
    if (!proposal || running.current) return;
    running.current = true;
    setPending(approved);
    try {
      await execute(
        approved === 'cancel'
          ? { action: 'reorder.cancel', proposal_id: proposal.id }
          : { action: 'reorder.vote', proposal_id: proposal.id, approved },
      );
    } catch {
      /* Mutation feedback keeps the current proposal available for retry. */
    } finally {
      running.current = false;
      setPending(null);
    }
  };
  return (
    <section
      hidden={hidden}
      className="reorder-voting panel"
      aria-label="Biểu quyết đổi vị trí bài"
      tabIndex={-1}
    >
      <div className="panel-title">
        <h3>
          <Users size={18} /> {proposal ? 'Biểu quyết trong phòng' : 'Cùng quyết định thứ tự'}
        </h3>
        {controls ?? <span className="badge">{snapshot.reorder?.online_count ?? 0} online</span>}
      </div>
      {!proposal ? (
        <p>
          Chọn “Đề xuất vị trí” cạnh một bài hát. Cần quá nửa người online và ít nhất 2 người đồng
          ý.
        </p>
      ) : (
        <>
          <p role={controls ? undefined : 'status'} className="proposal-status">
            {status && outcomes[status]}
          </p>
          <p>
            <strong>{proposal.requester}</strong> đề xuất đưa <strong>{proposal.title}</strong> từ
            vị trí <strong>{proposal.from_position}</strong> đến{' '}
            <strong>
              {proposal.target_position === 1
                ? 'đầu hàng chờ'
                : `vị trí ${proposal.target_position}`}
            </strong>
            .
          </p>
          <p className="proposal-count">
            <strong>
              {proposal.yes_votes}/{proposal.required_votes} phiếu đồng ý cần có
            </strong>{' '}
            · {proposal.no_votes} không đồng ý
          </p>
          {status === 'OPEN' && (
            <>
              {proposal.eligible && proposal.my_vote === null && (
                <p className="vote-attention">Đang chờ ý kiến của bạn</p>
              )}
              <p className="muted">
                {proposal.electorate_count} người có quyền biểu quyết, chốt lúc tạo đề xuất. Còn{' '}
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}. Bài đang phát
                vẫn tiếp tục.
              </p>
              {proposal.eligible ? (
                <div className="proposal-actions">
                  <Button
                    variant={proposal.my_vote === true ? 'primary' : 'secondary'}
                    disabled={pending !== null || proposal.my_vote === true}
                    loading={pending === true}
                    loadingLabel="Đang gửi…"
                    onClick={() => void vote(true)}
                  >
                    <Check size={17} />
                    {proposal.my_vote === true ? 'Bạn đã đồng ý' : 'Đồng ý'}
                  </Button>
                  <Button
                    disabled={pending !== null || proposal.my_vote === false}
                    loading={pending === false}
                    loadingLabel="Đang gửi…"
                    onClick={() => void vote(false)}
                  >
                    <X size={17} />
                    {proposal.my_vote === false ? 'Bạn không đồng ý' : 'Không đồng ý'}
                  </Button>
                </div>
              ) : (
                <p className="muted">
                  Bạn vào sau khi đề xuất được tạo; hãy tham gia lần biểu quyết tiếp theo.
                </p>
              )}
              {(proposal.requested_by === snapshot.me || snapshot.role !== 'member') && (
                <Button
                  variant="ghost"
                  disabled={pending !== null}
                  loading={pending === 'cancel'}
                  loadingLabel="Đang hủy…"
                  onClick={() => void vote('cancel')}
                >
                  Hủy đề xuất
                </Button>
              )}
            </>
          )}
          {status !== 'OPEN' && status !== 'APPLIED' && (
            <p className="muted">
              Thứ tự không đổi bởi đề xuất này. Bạn có thể tạo đề xuất mới từ hàng chờ hiện tại.
            </p>
          )}
        </>
      )}
      {(snapshot.reorder?.online_count ?? 0) < 2 && (
        <p className="notice">
          Chưa đủ 2 người online. Không thể tự duyệt đề xuất; hãy đợi thành viên khác vào phòng hoặc
          nhờ chủ phòng tắt biểu quyết.
        </p>
      )}
    </section>
  );
}

export function ReorderProposalDialog({
  entry,
  ordered,
  execute,
  onClose,
}: {
  entry: QueueEntry;
  ordered: QueueEntry[];
  execute: Execute;
  onClose: () => void;
}) {
  const [position, setPosition] = useState(ordered[0]?.id === entry.id ? 2 : 1);
  const [originalFocus] = useState(() => document.activeElement as HTMLElement | null);
  const [initialOrder] = useState(() => ordered.map((item) => item.id));
  const stale =
    initialOrder.length !== ordered.length ||
    ordered.some((item, index) => item.id !== initialOrder[index]);
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const submitted = useRef(false);
  const from = ordered.findIndex((item) => item.id === entry.id) + 1;
  return (
    <Modal
      open
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const target =
          !submitted.current &&
          originalFocus?.isConnected &&
          originalFocus !== document.body &&
          !originalFocus.matches(':disabled')
            ? originalFocus
            : document.querySelector<HTMLElement>('.reorder-help');
        target?.focus({ preventScroll: true });
      }}
      onOpenChange={(open) => {
        if (!open && !running.current) onClose();
      }}
      title="Đề xuất đổi vị trí bài"
      description="Mọi người sẽ bỏ phiếu trước khi thay đổi thứ tự. Bài đang phát không bị ngắt."
    >
      <form
        className="proposal-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (running.current || from < 1 || stale) return;
          running.current = true;
          setPending(true);
          try {
            await execute({
              action: 'reorder.propose',
              entry_id: entry.id,
              position,
              queue_ids: initialOrder,
            });
            submitted.current = true;
            onClose();
          } catch {
            /* Keep the form for retry after feedback. */
          } finally {
            running.current = false;
            setPending(false);
          }
        }}
      >
        <p>
          <strong>{entry.song.title}</strong> · Vị trí hiện tại: {from}
        </p>
        <label>
          Vị trí đề xuất
          <select
            aria-label="Vị trí đề xuất"
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            disabled={pending || stale}
          >
            {ordered.map((item, index) => (
              <option key={item.id} value={index + 1} disabled={index + 1 === from}>
                {index === 0
                  ? '1 — Đầu hàng chờ (phát tiếp theo)'
                  : `${index + 1} — Vị trí ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        {stale && (
          <p role="alert" className="notice">
            Hàng chờ đã thay đổi. Hãy đóng cửa sổ này và chọn lại vị trí theo thứ tự mới.
          </p>
        )}
        <p className="muted">
          Phiếu đồng ý của bạn được tính khi gửi. Đề xuất cần ít nhất một người khác đồng ý và đạt
          quá nửa số người online.
        </p>
        <div className="proposal-actions">
          <Button onClick={onClose} disabled={pending}>
            Hủy
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={stale || from < 1 || position === from || position > ordered.length}
            loading={pending}
            loadingLabel="Đang gửi…"
          >
            <ArrowUpToLine size={17} /> Gửi đề xuất
          </Button>
        </div>
      </form>
    </Modal>
  );
}

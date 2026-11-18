import { useRef, useState } from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { symbolNames, type BauSymbol, type Bet } from '../../../shared/bau-cua/contracts';
import { Modal } from '../ui';

const money = (amount: number) => amount.toLocaleString('vi-VN');

export default function BauBets({
  bets,
  symbol,
  actor,
}: {
  bets: Bet[];
  symbol: BauSymbol;
  actor: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  // Keep names in stable order while amounts change, with other players first.
  const ordered = [...bets].sort(
    (a, b) =>
      Number(a.user_id === actor) - Number(b.user_id === actor) ||
      a.name.localeCompare(b.name, 'vi') ||
      a.user_id.localeCompare(b.user_id),
  );
  const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
  const name = symbolNames[symbol];
  return (
    <div className="bau-bettors" ref={container} tabIndex={-1}>
      {ordered.length ? (
        <>
          <button
            type="button"
            ref={trigger}
            className="bau-bettors-trigger"
            aria-label={`Xem người đặt ô ${name}`}
            onClick={() => setOpen(true)}
          >
            <Users size={13} aria-hidden="true" />
            <span>{ordered.length} người đặt</span>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
          <ul className="bau-bettors-preview" aria-label={`Người đặt ô ${name}`}>
            {ordered.slice(0, 2).map((bet) => (
              <li key={bet.user_id}>
                <span title={bet.name}>{bet.user_id === actor ? 'Bạn' : bet.name}</span>
                <b aria-label={`${money(bet.amount)} coin`}>{money(bet.amount)}</b>
              </li>
            ))}
          </ul>
          {ordered.length > 2 && (
            <button
              type="button"
              className="bau-bettors-more"
              onClick={() => setOpen(true)}
              aria-label={`Xem tất cả ${ordered.length} người đặt ô ${name}`}
            >
              +{ordered.length - 2} người khác
            </button>
          )}
        </>
      ) : (
        <span className="bau-bettors-empty">Chưa có cược</span>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (trigger.current ?? container.current)?.focus({ preventScroll: true });
        }}
        title={`Người đặt ô ${name}`}
        description="Cược đã được xác nhận trong vòng hiện tại, tự cập nhật khi có thay đổi."
        className="bau-modal"
      >
        <p className="bau-bettors-summary">
          <span>{ordered.length} người đặt</span>
          <strong>Tổng {money(total)} coin</strong>
        </p>
        {ordered.length ? (
          <ul className="bau-bettors-detail">
            {ordered.map((bet) => (
              <li key={bet.user_id}>
                <span>
                  {bet.name}
                  {bet.user_id === actor && <small> (bạn)</small>}
                </span>
                <b>{money(bet.amount)} coin</b>
              </li>
            ))}
          </ul>
        ) : (
          <p>Ô này chưa có cược trong vòng hiện tại.</p>
        )}
      </Modal>
    </div>
  );
}

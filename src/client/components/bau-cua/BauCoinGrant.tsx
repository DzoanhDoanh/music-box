import { useRef, useState } from 'react';
import { Check, Coins } from 'lucide-react';
import type { Member } from '../../../shared/contracts';
import { coinGrantSchema, type BauCommand } from '../../../shared/bau-cua/contracts';
import { AsyncButton, Button } from '../ui';

type Grant = { user: string; name: string; amount: number; reason: string };
const money = (amount: number) => amount.toLocaleString('vi-VN');

export default function BauCoinGrant({
  members,
  actor,
  busy,
  retry,
  send,
}: {
  members: Member[];
  actor: string;
  busy: boolean;
  retry: boolean;
  send: (command?: BauCommand) => Promise<unknown>;
}) {
  const [user, setUser] = useState('');
  const [amount, setAmount] = useState('1000');
  const [reason, setReason] = useState('');
  const [review, setReview] = useState<Grant | null>(null);
  const [done, setDone] = useState<Grant | null>(null);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const recipient = members.find((member) => member.user_id === user);
  const parsed = coinGrantSchema.safeParse({ user, amount: Number(amount), reason });

  if (done)
    return (
      <div className="bau-coin-grant bau-grant-success" role="status">
        <Check size={28} aria-hidden="true" />
        <h3 ref={heading} tabIndex={-1}>
          Đã cấp {money(done.amount)} coin
        </h3>
        <p>
          Người nhận: <strong>{done.name}</strong>
        </p>
        <p>Giao dịch đã được ghi vào sổ coin và nhật ký quản trị.</p>
        <Button
          onClick={() => {
            setDone(null);
            setReview(null);
            setReason('');
          }}
        >
          Cấp thêm coin
        </Button>
      </div>
    );

  return (
    <div className="bau-coin-grant">
      {retry && (
        <div className="bau-warning" role="status">
          Chưa nhận được xác nhận cho thao tác trước. Xác minh trước khi cấp tiếp để tránh cộng
          trùng.
          <AsyncButton
            onClick={async () => {
              await send();
              setReview(null);
              setReason('');
            }}
          >
            Xác minh thao tác trước
          </AsyncButton>
        </div>
      )}
      {review ? (
        <>
          <h3 tabIndex={-1} ref={heading}>
            Kiểm tra lần cuối
          </h3>
          <dl className="bau-grant-review">
            <div>
              <dt>Người nhận</dt>
              <dd>{review.name}</dd>
            </div>
            <div>
              <dt>Số coin được cộng</dt>
              <dd>+{money(review.amount)}</dd>
            </div>
            <div>
              <dt>Lý do</dt>
              <dd>{review.reason}</dd>
            </div>
          </dl>
          {!members.some((member) => member.user_id === review.user) && (
            <p role="alert">Người nhận không còn trong phòng. Hãy chọn lại.</p>
          )}
          <div className="dialog-actions">
            <Button disabled={busy} onClick={() => setReview(null)}>
              Chỉnh lại
            </Button>
            <AsyncButton
              variant="primary"
              disabled={busy || !members.some((member) => member.user_id === review.user)}
              loadingLabel="Đang cấp coin…"
              onClick={async () => {
                await send({
                  action: 'adjust',
                  user: review.user,
                  amount: review.amount,
                  reason: review.reason,
                });
                setDone(review);
                requestAnimationFrame(() => heading.current?.focus());
              }}
            >
              Xác nhận cấp coin
            </AsyncButton>
          </div>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            if (!parsed.success || !recipient) {
              setError(
                'Chọn người nhận, nhập từ 1 đến 1.000.000 coin nguyên và lý do từ 5 đến 200 ký tự.',
              );
              return;
            }
            setError('');
            setReview({ ...parsed.data, name: recipient.name });
            requestAnimationFrame(() => heading.current?.focus());
          }}
        >
          <label>
            Người nhận
            <select
              value={user}
              required
              disabled={busy}
              onChange={(event) => setUser(event.target.value)}
            >
              <option value="">Chọn thành viên trong phòng</option>
              {[...members]
                .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
                .map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name}
                    {member.user_id === actor ? ' (bạn)' : ''} · {member.user_id.slice(-6)}
                  </option>
                ))}
            </select>
          </label>
          <small>Có thể cấp cho thành viên đang offline hoặc chưa vào bàn chơi.</small>
          <label>
            Số coin cấp
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000000}
              step={1}
              required
              disabled={busy}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <div className="bau-grant-presets" aria-label="Chọn nhanh số coin">
            {[1000, 5000, 10000].map((value) => (
              <Button
                key={value}
                disabled={busy}
                aria-pressed={Number(amount) === value}
                onClick={() => setAmount(String(value))}
              >
                {money(value)}
              </Button>
            ))}
          </div>
          <label>
            Lý do cấp coin
            <textarea
              rows={2}
              minLength={5}
              maxLength={200}
              required
              disabled={busy}
              placeholder="Ví dụ: Thưởng hoạt động trong phòng"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <small>Tối đa 1.000.000 coin mỗi lần. Lý do được lưu trong nhật ký quản trị.</small>
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !parsed.success || !recipient}
            >
              <Coins size={17} aria-hidden="true" />
              Tiếp tục
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

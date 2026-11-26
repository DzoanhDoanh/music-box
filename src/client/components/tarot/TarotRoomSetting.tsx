import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatCoins, TAROT_PRICES, type TarotSnapshot } from '../../../shared/tarot/contracts';
import { api } from '../../lib/api';

/** Room-settings switch: whether drawing Tarot costs coins in this room. Saves on change. */
export default function TarotRoomSetting({ room, actor }: { room: string; actor: string }) {
  const client = useQueryClient();
  const key = ['tarot', room, actor];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<TarotSnapshot>(`/rooms/${room}/tarot`, undefined, undefined, actor),
    staleTime: 2000,
  });
  // Shows the new value at once; the server's value takes over again after saving or failing.
  const [choice, setChoice] = useState<boolean | null>(null);
  const paid = choice ?? query.data?.paid !== false;
  async function save(next: boolean) {
    setChoice(next);
    try {
      await api(`/rooms/${room}/tarot/settings`, { paid: next }, undefined, actor);
      await client.invalidateQueries({ queryKey: key });
      toast.success(next ? 'Bói Tarot đã tính xu.' : 'Bói Tarot đã miễn phí trong phòng này.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chưa lưu được cài đặt.');
    } finally {
      setChoice(null);
    }
  }
  return (
    <fieldset>
      <legend>Bói Tarot</legend>
      <label className="toggle-row">
        <span>Tính xu khi rút bài</span>
        <input
          type="checkbox"
          role="switch"
          checked={paid}
          disabled={!query.data || choice !== null}
          aria-describedby="tarot-paid-help"
          onChange={(event) => void save(event.target.checked)}
        />
      </label>
      <p className="muted" id="tarot-paid-help">
        {paid
          ? `Người rút trả xu từ ví chung: 1 lá ${formatCoins(TAROT_PRICES.ONE)}, 3 lá ${formatCoins(
              TAROT_PRICES.THREE,
            )}, Có/Không ${formatCoins(TAROT_PRICES.YES_NO)}. Cả phòng xem miễn phí.`
          : 'Mọi người trong phòng rút bài miễn phí.'}{' '}
        Thay đổi được lưu ngay.
      </p>
    </fieldset>
  );
}

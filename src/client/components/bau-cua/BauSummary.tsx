import { Trophy } from 'lucide-react';
import type { BauSnapshot } from '../../../shared/bau-cua/contracts';
import { recentLeaders, roundStandings } from '../../../shared/bau-cua/summary';
export function BauResult({ data, actor }: { data: BauSnapshot; actor: string }) {
  const r = data.round;
  if (!r || r.status !== 'RESULT') return null;
  const names = Object.fromEntries(data.members.map((m) => [m.user_id, m.name]));
  const standings = roundStandings(r, names),
    mine = standings.find((p) => p.user === actor),
    winner = standings.find((p) => p.net > 0);
  return (
    <div
      key={r.id}
      className={'bau-result-summary ' + (mine && mine.net > 0 ? 'is-win' : '')}
      role="status"
    >
      <Trophy size={24} />
      <div>
        <strong>
          {mine
            ? mine.net > 0
              ? `Bạn thêm ${mine.net.toLocaleString('vi-VN')} coin!`
              : mine.net < 0
                ? `Vòng này bạn giảm ${(-mine.net).toLocaleString('vi-VN')} coin`
                : 'Vòng này bạn hòa coin'
            : 'Vòng đã quyết toán'}
        </strong>
        <p>
          {winner
            ? `${winner.name} dẫn đầu vòng: +${winner.net.toLocaleString('vi-VN')} coin.`
            : 'Coin đã được ghi vào sổ.'}{' '}
          {mine?.awards.join(' · ')}
        </p>
      </div>
    </div>
  );
}
export function BauLeaderboard({ data }: { data: BauSnapshot }) {
  const leaders = recentLeaders(
    data.history,
    Object.fromEntries(data.members.map((m) => [m.user_id, m.name])),
  );
  return (
    <section className="bau-leaderboard">
      <h3>
        <Trophy size={17} /> Những gương mặt may mắn
      </h3>
      <p>
        Trong {data.history.filter((r) => r.status === 'RESULT').length} vòng gần nhất được công bố
        · danh hiệu vui, không cộng coin.
      </p>
      {leaders.length ? (
        <ol>
          {leaders.slice(0, 5).map((p, i) => (
            <li key={p.user}>
              <span className="bau-rank">{i + 1}</span>
              <div>
                <strong>{p.name}</strong>
                <small>{p.awards.join(' · ') || `${p.wins} vòng có lãi`}</small>
              </div>
              <b className={p.net >= 0 ? 'bau-positive' : 'bau-negative'}>
                {p.net > 0 ? '+' : ''}
                {p.net.toLocaleString('vi-VN')}
              </b>
            </li>
          ))}
        </ol>
      ) : (
        <p>Danh sách xuất hiện khi có vòng được quyết toán và công bố.</p>
      )}
    </section>
  );
}

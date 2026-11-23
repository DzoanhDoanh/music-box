import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, Users } from 'lucide-react';
import './game-picker.css';

type Game = {
  key: string;
  name: string;
  art: string;
  tag: string;
  pitch: string;
  players: string;
  length: string;
  cta: string;
  to?: string;
  anchor?: string;
};

/** One consistent entry point for every game in the room. */
export default function GamePicker({
  room,
  ludo,
  bau,
  duck,
}: {
  room: string;
  ludo: boolean;
  bau: boolean;
  duck: boolean;
}) {
  const games: Game[] = [
    ...(duck
      ? [
          {
            key: 'duck',
            name: 'Duck Race Party',
            art: '🦆',
            tag: 'Đua vịt 3D',
            pitch: 'Mỗi người một chú vịt. Thả xuống sông và cùng cổ vũ xem ai về đích đầu tiên.',
            players: '2–30 vịt',
            length: '30 giây – 2 phút',
            cta: 'Mở đường đua',
            to: `/room/${room}/games/duck-race`,
          },
        ]
      : []),
    ...(bau
      ? [
          {
            key: 'bau',
            name: 'Bầu Cua Party',
            art: '🦀',
            tag: 'Coin giải trí',
            pitch: 'Đặt cửa bầu, cua, tôm, cá, gà, nai rồi cùng mở bát. Ai cũng có thể cầm cái.',
            players: '2–32 người',
            length: '~35 giây / ván',
            cta: 'Vào sòng',
            to: `/room/${room}/games/bau-cua`,
          },
        ]
      : []),
    ...(ludo
      ? [
          {
            key: 'ludo',
            name: 'Cờ cá ngựa',
            art: '♞',
            tag: 'Theo lượt',
            pitch: 'Tung xúc xắc, đi quân khéo léo và đưa cả bốn quân về chuồng trước.',
            players: '2–4 người',
            length: '15–30 phút',
            cta: 'Chọn bàn cờ',
            anchor: 'ludo-lobby',
          },
        ]
      : []),
  ];
  if (!games.length) return null;
  return (
    <section className="game-picker" aria-labelledby="game-picker-title">
      <header className="game-picker-head">
        <span className="eyebrow">ROOMTUNE PLAY</span>
        <h2 id="game-picker-title">Chơi gì cùng cả phòng?</h2>
        <p>Nhạc vẫn phát trong lúc chơi. Chọn một trò để bắt đầu.</p>
      </header>
      <div className="game-picker-grid">
        {games.map((game) => {
          const body = (
            <>
              <span className="game-picker-art" aria-hidden="true">
                {game.art}
              </span>
              <span className="game-picker-tag">{game.tag}</span>
              <strong className="game-picker-name">{game.name}</strong>
              <span className="game-picker-pitch">{game.pitch}</span>
              <span className="game-picker-meta">
                <span>
                  <Users size={14} aria-hidden="true" /> {game.players}
                </span>
                <span>
                  <Clock3 size={14} aria-hidden="true" /> {game.length}
                </span>
              </span>
              <span className="game-picker-cta">
                {game.cta} <ArrowRight size={16} aria-hidden="true" />
              </span>
            </>
          );
          return game.to ? (
            <Link
              key={game.key}
              className={`game-picker-card is-${game.key}`}
              data-art={game.art}
              to={game.to}
            >
              {body}
            </Link>
          ) : (
            <a
              key={game.key}
              className={`game-picker-card is-${game.key}`}
              data-art={game.art}
              href={`#${game.anchor}`}
              onClick={(event) => {
                const target = document.getElementById(game.anchor!);
                if (!target) return;
                event.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {body}
            </a>
          );
        })}
      </div>
    </section>
  );
}

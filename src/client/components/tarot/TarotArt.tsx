// Card faces are the 1909 Rider–Waite–Smith scans (public domain, via Wikimedia Commons),
// stored as public/tarot/NN.jpg in deck order. The back is an original SVG drawn for ROOMTUNE.
import { useId } from 'react';
import type { TarotCard } from '../../../shared/tarot/deck';

const W = 210,
  H = 360;

export const cardImage = (card: Pick<TarotCard, 'id'>) =>
  `/tarot/${String(card.id).padStart(2, '0')}.jpg`;

export function TarotCardFace({ card, title }: { card: TarotCard; title?: string }) {
  return (
    <span className="tarot-face-art">
      <img
        src={cardImage(card)}
        alt={title ?? ''}
        aria-hidden={title ? undefined : true}
        width={W}
        height={H}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}

export function TarotCardBack() {
  const id = useId().replace(/:/g, '');
  const gold = `${id}-g`,
    bg = `${id}-b`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tarot-svg" aria-hidden="true">
      <defs>
        <radialGradient id={bg} cx=".5" cy=".5" r=".75">
          <stop offset="0" stopColor="#3a2470" />
          <stop offset="1" stopColor="#0f0a24" />
        </radialGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c2" />
          <stop offset=".5" stopColor="#d9aa52" />
          <stop offset="1" stopColor="#f6dc93" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} rx="14" fill={`url(#${bg})`} />
      <g fill="none" stroke={`url(#${gold})`} strokeLinecap="round">
        <rect x="6" y="6" width={W - 12} height={H - 12} rx="12" strokeWidth="2.4" />
        <rect x="14" y="14" width={W - 28} height={H - 28} rx="8" strokeWidth=".8" />
        <g transform={`translate(${W / 2} ${H / 2})`} strokeWidth="1.1">
          <circle r="66" />
          <circle r="58" opacity=".6" />
          <circle r="22" />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (Math.PI * 2 * i) / 24;
            return (
              <line
                key={i}
                x1={24 * Math.cos(a)}
                y1={24 * Math.sin(a)}
                x2={(i % 2 ? 50 : 56) * Math.cos(a)}
                y2={(i % 2 ? 50 : 56) * Math.sin(a)}
              />
            );
          })}
          {Array.from({ length: 12 }, (_, i) => (
            <ellipse
              key={i}
              rx="9"
              ry="30"
              transform={`rotate(${i * 30}) translate(0 -88)`}
              opacity=".7"
            />
          ))}
          <path d="M8 -10 a12 12 0 1 0 0 20 a15 15 0 0 1 0 -20z" fill="#f3d58a" stroke="none" />
        </g>
        {/* moon phases along the top and bottom */}
        {[-2, -1, 0, 1, 2].map((p) => (
          <g key={p}>
            <circle cx={W / 2 + p * 30} cy="34" r="6" />
            <circle cx={W / 2 + p * 30} cy={H - 34} r="6" />
          </g>
        ))}
      </g>
      <g fill="#f3d58a">
        {[-2, -1, 1, 2].map((p) => (
          <g key={p}>
            <path
              d={`M${W / 2 + p * 30 + (p < 0 ? -6 : 6) * 0} 28 a6 6 0 0 ${p < 0 ? 0 : 1} 0 12 a${Math.abs(p) === 1 ? 3 : 6} 6 0 0 ${p < 0 ? 1 : 0} 0 -12z`}
            />
            <path
              d={`M${W / 2 + p * 30} ${H - 40} a6 6 0 0 ${p < 0 ? 0 : 1} 0 12 a${Math.abs(p) === 1 ? 3 : 6} 6 0 0 ${p < 0 ? 1 : 0} 0 -12z`}
            />
          </g>
        ))}
        <circle cx={W / 2} cy="34" r="6" />
        <circle cx={W / 2} cy={H - 34} r="6" />
        {[
          [40, 80],
          [170, 90],
          [36, 280],
          [176, 270],
          [60, 120],
          [150, 250],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.3" opacity=".8" />
        ))}
      </g>
    </svg>
  );
}

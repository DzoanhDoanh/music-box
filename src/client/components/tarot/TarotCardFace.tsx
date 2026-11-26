import { cardNumeral, suits, type TarotCard, type TarotSuit } from '../../../shared/tarot/deck';

/** Original line icons for the four suits and the Major Arcana (drawn for ROOMTUNE). */
export function SuitIcon({ suit, size = 34 }: { suit: TarotSuit | null; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (suit) {
    case 'WANDS':
      return (
        <svg {...common}>
          <path d="M8 21 16 3" />
          <path d="M13.2 9.2c1.6-.4 2.6.2 3.3 1.3M11.4 13.2c-1.5-.3-2.5.3-3 1.4M15 5.3c1.2-.6 2.3-.3 3 .6" />
        </svg>
      );
    case 'CUPS':
      return (
        <svg {...common}>
          <path d="M6 3h12l-1 6.5a5 5 0 0 1-10 0z" />
          <path d="M12 14.5V19M8 21h8M7.4 7h9.2" />
        </svg>
      );
    case 'SWORDS':
      return (
        <svg {...common}>
          <path d="M12 2l2 3v10h-4V5z" />
          <path d="M7 15h10M12 15v7M10.5 22h3" />
        </svg>
      );
    case 'PENTACLES':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 5.2l1.9 4.4 4.7.4-3.6 3.1 1.1 4.6L12 15.2l-4.1 2.5 1.1-4.6L5.4 10l4.7-.4z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22M4.9 4.9l2.3 2.3M16.8 16.8l2.3 2.3M4.9 19.1l2.3-2.3M16.8 7.2l2.3-2.3" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </svg>
      );
  }
}

export function TarotCardFace({ card }: { card: TarotCard }) {
  const numeral = cardNumeral(card);
  const tone = card.suit ? card.suit.toLowerCase() : 'major';
  return (
    <div className={`tarot-face tarot-tone-${tone}`}>
      <span className="tarot-numeral">{numeral}</span>
      <div className="tarot-emblem">
        <SuitIcon suit={card.suit} size={card.arcana === 'MAJOR' ? 46 : 40} />
      </div>
      <span className="tarot-card-name">{card.name}</span>
      <small className="tarot-card-suit">{card.suit ? suits[card.suit].name : 'Ẩn chính'}</small>
    </div>
  );
}

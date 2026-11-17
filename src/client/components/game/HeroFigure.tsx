import type { HeroSkin } from '../../../shared/game/piece-skins';

const ink = '#202030';
const light = '#fff3d9';

/** Original chibi silhouettes in a 24-unit grid, scaled into the board's piece coordinates. */
export default function HeroFigure({ skin, gloss }: { skin: HeroSkin; gloss?: string }) {
  return (
    <g
      transform="translate(-.48 -.5) scale(.04)"
      fill="var(--horse)"
      stroke={ink}
      strokeWidth=".9"
      strokeLinejoin="round"
      strokeLinecap="round"
      data-hero={skin}
    >
      {skin === 'HERO' && (
        <>
          <path d="M7 10 2 21 8 19 12 22 16 19 22 21 17 10Z" />
          <path d="M8 18 7 22H11L12 19 13 22H17L16 18" fill={ink} />
          <path d="M7 10 4 16 7 17 9 14 9 19H15V14L17 17 20 16 17 10Z" />
          {gloss && (
            <path
              d="M7 10 4 16 7 17 9 14 9 19H15V14L17 17 20 16 17 10Z"
              fill={gloss}
              stroke="none"
            />
          )}
          <path d="m12 11-3 2 3 4 3-4Z" fill={light} />
          <circle cx="12" cy="6.5" r="5.2" fill="#ffceac" />
          <path d="M6.8 6Q6 1 11 1H15Q18 2 17 6L14 4 11 5 12 3 8 5Z" fill={ink} />
          <path d="M7.5 6 12 7 16.5 6 16 8.5 12 8 8 8.5Z" />
          <path d="M9 7.5h1M14 7.5h1M11 10h2" fill="none" />
        </>
      )}
      {skin === 'MASKED_HERO' && (
        <>
          <path d="m16 9 6 2-4 2 3 2-6-1Z" />
          <path d="M8 17 6 22H11L12 19 13 22H18L16 17" fill={ink} />
          <path d="M7 10 3 16 6 18 9 14V19H15V14L18 18 21 16 17 10Z" />
          {gloss && (
            <path d="M7 10 3 16 6 18 9 14V19H15V14L18 18 21 16 17 10Z" fill={gloss} stroke="none" />
          )}
          <circle cx="12" cy="6.5" r="5.5" />
          <path d="m10 3-1-2m5 2 1-2" fill="none" />
          <path d="M7.5 5.5 11 6.5V9L8 8.5ZM16.5 5.5 13 6.5V9L16 8.5Z" fill={light} />
          <path d="M10 10h4M12 2v3" fill="none" />
          <path d="m12 12-2 2 2 3 2-3Z" fill={light} />
        </>
      )}
      {skin === 'ROBOT' && (
        <>
          <path d="M12 4V2" fill="none" />
          <circle cx="12" cy="1.5" r="1" fill={light} />
          <path d="M8 18 7 22H11V19H13V22H17L16 18" fill={ink} />
          <path d="M6 12H3V18H6M18 12H21V18H18" />
          <rect x="7" y="11" width="10" height="9" rx="2" />
          {gloss && <rect x="7" y="11" width="10" height="9" rx="2" fill={gloss} stroke="none" />}
          <rect x="5" y="3.5" width="14" height="9" rx="2.5" />
          <path d="M5 6H3V10H5M19 6H21V10H19" />
          <rect x="7" y="5.5" width="10" height="4" rx="1.3" fill={ink} />
          <path d="M9 7.5h1M14 7.5h1" stroke={light} strokeWidth="1.4" />
          <path d="M10 11h4M10 14h4" fill="none" />
        </>
      )}
      {skin === 'NINJA' && (
        <>
          <path d="m17 7 5 2-4 2 4 3-6-2" />
          <path d="m5 4 14 17" fill="none" strokeWidth="2.5" />
          <path d="M8 18 6 22H11L12 19 13 22H18L16 18" fill={ink} />
          <path d="M7 10 3 16 6 18 9 14V20H15V14L18 18 21 16 17 10Z" fill={ink} />
          <path d="m8 12 4 5 4-5M8 18h8" fill="none" stroke="var(--horse)" strokeWidth="1.8" />
          <circle cx="12" cy="6.5" r="5.5" fill={ink} />
          <path d="M7 5.5Q12 4 17 5.5V8Q12 9 7 8Z" fill={light} />
          <path d="M7 4Q12 2 17 4V5.5Q12 4 7 5.5Z" />
          <path d="m9 6.5 1 .5m5-.5-1 .5" fill="none" />
          {gloss && <path d="M7 4Q12 2 17 4V5.5Q12 4 7 5.5Z" fill={gloss} stroke="none" />}
        </>
      )}
    </g>
  );
}

import {
  Bird,
  Cat,
  Crown,
  Dog,
  Fish,
  Gem,
  Ghost,
  Rabbit,
  Rocket,
  Star,
  Turtle,
} from 'lucide-react';
import { isHeroSkin, type PieceSkin } from '../../../shared/game/piece-skins';
import HeroFigure from './HeroFigure';

export const horseShape =
  'M-.32,.28 Q-.4,.1 -.2,-.04 L-.13,-.22 L-.3,-.24 L-.2,-.42 L.02,-.39 L.1,-.5 L.18,-.3 Q.38,-.18 .27,.1 L.34,.28 Z';
const icons = {
  CAT: Cat,
  DOG: Dog,
  RABBIT: Rabbit,
  BIRD: Bird,
  FISH: Fish,
  TURTLE: Turtle,
  ROCKET: Rocket,
  CROWN: Crown,
  GEM: Gem,
  GHOST: Ghost,
  STAR: Star,
};

/** Normalized SVG figure shared by the board and picker; no external images or font emoji. */
export default function PieceFigure({
  skin = 'HORSE',
  number,
  gloss,
}: {
  skin?: PieceSkin;
  number?: number;
  gloss?: string;
}) {
  const hero = isHeroSkin(skin);
  const Icon = skin === 'HORSE' || hero ? null : icons[skin];
  return (
    <g aria-hidden="true" pointerEvents="none">
      {hero ? (
        <g className="ludo-horse">
          <HeroFigure skin={skin} gloss={gloss} />
          {number !== undefined && <circle cy=".28" r=".135" fill="var(--horse)" />}
        </g>
      ) : Icon ? (
        <g className="ludo-horse">
          <circle cy="-.09" r=".39" />
          {gloss && <circle cy="-.09" r=".39" fill={gloss} stroke="none" />}
          <Icon
            x="-.29"
            y="-.39"
            width=".58"
            height=".58"
            color="#171625"
            fill="none"
            strokeWidth={1.8}
          />
          {number !== undefined && <circle cy=".28" r=".135" fill="var(--horse)" />}
        </g>
      ) : (
        <>
          <path d={horseShape} className="ludo-horse" />
          {gloss && <path d={horseShape} fill={gloss} />}
          <circle cx="-.08" cy="-.28" r=".035" fill="#151321" />
        </>
      )}
      {number !== undefined && (
        <text
          x="0"
          y={skin === 'HORSE' ? '.25' : '.35'}
          textAnchor="middle"
          className="ludo-piece-number"
        >
          {number}
        </text>
      )}
    </g>
  );
}

export function PiecePreview({
  skin,
  number = 1,
  color = 0,
}: {
  skin?: PieceSkin;
  number?: number;
  color?: number;
}) {
  return (
    <svg
      viewBox="-.6 -.6 1.2 1.2"
      className={'game-piece-preview ludo-color-' + color}
      aria-hidden="true"
    >
      <PieceFigure skin={skin} number={number} />
    </svg>
  );
}

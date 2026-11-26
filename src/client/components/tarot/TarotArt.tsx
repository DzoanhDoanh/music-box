// Original line-art deck drawn for ROOMTUNE: gold engraving on a night-sky card.
// Every card is one self-contained SVG (viewBox 210×360) so it stays crisp at any size.
import { useId, type ReactNode } from 'react';
import { cardNumeral, type TarotCard, type TarotSuit } from '../../../shared/tarot/deck';

const W = 210,
  H = 360;
const palettes: Record<'MAJOR' | TarotSuit, [string, string, string]> = {
  // [deep, light, accent]
  MAJOR: ['#140f2e', '#3b2a73', '#b9a2ff'],
  WANDS: ['#220d05', '#6e2c10', '#ff9a5c'],
  CUPS: ['#06172a', '#1d4f7a', '#7cc7ff'],
  SWORDS: ['#0d1219', '#3a4a5f', '#c9d8ee'],
  PENTACLES: ['#151405', '#4d4312', '#f3d36b'],
};

/* ------------------------------------------------------------ suit glyphs (24×24) */
export function SuitGlyph({ suit }: { suit: TarotSuit }) {
  switch (suit) {
    case 'WANDS':
      return (
        <>
          <path d="M7 22 17 2" strokeWidth={2.2} />
          <path d="M13.4 9.6c2-.6 3.3.1 4.1 1.5M11.3 13.9c-1.9-.4-3.1.4-3.7 1.8M15.4 5.4c1.5-.8 2.9-.4 3.7.8" />
          <circle cx="17" cy="2.4" r="1.2" fill="currentColor" stroke="none" />
        </>
      );
    case 'CUPS':
      return (
        <>
          <path d="M5.5 3h13l-1.1 6.8a5.4 5.4 0 0 1-10.8 0z" />
          <path d="M12 15.2V19.5M8 21.5h8M6.8 6.6h10.4" />
          <path d="M9.5 10.5c1.6 1 3.4 1 5 0" opacity=".7" />
        </>
      );
    case 'SWORDS':
      return (
        <>
          <path d="M12 1.5l2.2 3.2v10.8h-4.4V4.7z" />
          <path d="M6.5 15.5h11M12 15.5v6M10.2 21.8h3.6" />
          <path d="M12 4v10" opacity=".6" />
        </>
      );
    case 'PENTACLES':
      return (
        <>
          <circle cx="12" cy="12" r="9.5" />
          <circle cx="12" cy="12" r="7.6" opacity=".5" />
          <path d="M12 5.2l1.95 4.5 4.85.4-3.7 3.2 1.15 4.75L12 15.5l-4.25 2.55L8.9 13.3 5.2 10.1l4.85-.4z" />
        </>
      );
  }
}
function Glyph({
  suit,
  x,
  y,
  s = 1,
  flip = false,
}: {
  suit: TarotSuit;
  x: number;
  y: number;
  s?: number;
  flip?: boolean;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s}) ${flip ? 'rotate(180)' : ''} translate(-12 -12)`}
    >
      <SuitGlyph suit={suit} />
    </g>
  );
}

/* ------------------------------------------------------------ small ornaments */
const star = (x: number, y: number, r: number, key?: string | number) => {
  const p: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2,
      rr = i % 2 ? r * 0.38 : r;
    p.push(`${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`);
  }
  return <polygon key={key} points={p.join(' ')} fill="currentColor" stroke="none" />;
};
const rays = (x: number, y: number, r1: number, r2: number, n: number) => (
  <g>
    {Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n;
      return (
        <line
          key={i}
          x1={x + r1 * Math.cos(a)}
          y1={y + r1 * Math.sin(a)}
          x2={x + (i % 2 ? r2 * 0.82 : r2) * Math.cos(a)}
          y2={y + (i % 2 ? r2 * 0.82 : r2) * Math.sin(a)}
        />
      );
    })}
  </g>
);
const pentagram = (x: number, y: number, r: number, inverted = false) => {
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = (Math.PI * 2 * i * 2) / 5 + (inverted ? Math.PI / 2 : -Math.PI / 2);
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  });
  return <polygon points={pts.join(' ')} fill="none" />;
};

/* ------------------------------------------------------------ Major Arcana scenes
   Drawn in a 170×240 box; (85,120) is the centre. Stroke = gold, fill = currentColor accents. */
const majorArt: Record<number, ReactNode> = {
  0: (
    <>
      <circle cx="132" cy="44" r="18" />
      {rays(132, 44, 23, 34, 16)}
      <path d="M0 200 L70 200 L96 214 L96 240" />
      <path d="M96 214 C120 222 150 230 170 232" opacity=".4" />
      <circle cx="70" cy="104" r="9" />
      <path d="M70 113 L66 160 M70 125 L50 138 M70 125 L96 112 M66 160 L56 196 M66 160 L82 192" />
      <path d="M96 112 L118 86" />
      <ellipse cx="121" cy="82" rx="8" ry="6" />
      <circle cx="42" cy="140" r="5" />
      <path d="M42 145v12M38 149h8" opacity=".6" />
      <path d="M28 190 q8-10 16 0 q8-10 16 0" opacity=".5" />
    </>
  ),
  1: (
    <>
      <path d="M62 30 c0-14 22-14 23 0 c1 14 23 14 23 0 c0-14-22-14-23 0 c-1 14-23 14-23 0z" />
      <circle cx="85" cy="74" r="11" />
      <path d="M85 85 L85 150 M85 100 L112 66 M85 104 L58 120" />
      <path d="M112 66 L118 52" strokeWidth={3} />
      {star(118, 48, 6)}
      <rect x="20" y="160" width="130" height="10" rx="2" />
      <path d="M30 170 v56 M140 170 v56" />
      <g transform="translate(28 140) scale(.8)" opacity=".95">
        <SuitGlyph suit="WANDS" />
      </g>
      <g transform="translate(60 140) scale(.8)">
        <SuitGlyph suit="CUPS" />
      </g>
      <g transform="translate(92 140) scale(.8)">
        <SuitGlyph suit="SWORDS" />
      </g>
      <g transform="translate(124 140) scale(.8)">
        <SuitGlyph suit="PENTACLES" />
      </g>
      <path d="M40 214 q10-12 20 0 q10-12 20 0 q10-12 20 0 q10-12 20 0" opacity=".5" />
    </>
  ),
  2: (
    <>
      <rect x="14" y="30" width="26" height="190" fill="currentColor" fillOpacity=".25" />
      <rect x="130" y="30" width="26" height="190" />
      <text x="27" y="62" textAnchor="middle" fontSize="16" fill="currentColor" stroke="none">
        B
      </text>
      <text x="143" y="62" textAnchor="middle" fontSize="16" fill="currentColor" stroke="none">
        J
      </text>
      <path d="M68 52 a17 17 0 1 1 34 0" />
      <circle cx="85" cy="52" r="7" />
      <path d="M85 70 C60 110 58 170 52 210 L118 210 C112 170 110 110 85 70z" />
      <rect x="72" y="118" width="26" height="18" rx="3" />
      <path d="M58 226 a28 12 0 0 0 54 0" fill="currentColor" fillOpacity=".3" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i} cx={52 + i * 13} cy="16" r="1.6" fill="currentColor" stroke="none" />
      ))}
    </>
  ),
  3: (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const a = Math.PI + (Math.PI * i) / 11;
        return star(85 + 46 * Math.cos(a), 62 + 22 * Math.sin(a), 5, i);
      })}
      <circle cx="85" cy="72" r="12" />
      <path d="M85 84 C50 120 40 180 30 214 L140 214 C130 180 120 120 85 84z" />
      <circle cx="85" cy="150" r="16" />
      <path d="M85 166 v22 M75 178 h20" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${20 + i * 30} 236 q4-20 0-34 q-4 14 0 34`} opacity=".7" />
      ))}
    </>
  ),
  4: (
    <>
      <path d="M0 210 L40 150 L70 190 L110 120 L170 210" opacity=".45" />
      <rect x="40" y="70" width="90" height="140" rx="4" />
      <path d="M40 70 c-10-14 4-26 14-16 M130 70 c10-14-4-26-14-16" />
      <circle cx="85" cy="58" r="12" />
      <path d="M73 46 l4-12 l8 8 l8-8 l4 12" />
      <path d="M85 90 v60 M60 110 h50" />
      <path d="M120 96 v76" strokeWidth={3} />
      <circle cx="120" cy="88" r="7" />
      <path d="M116 80 h8" />
      <circle cx="54" cy="160" r="9" fill="currentColor" fillOpacity=".35" />
    </>
  ),
  5: (
    <>
      <path d="M70 70 L72 30 L85 14 L98 30 L100 70z" />
      <path d="M71 44 h28 M71 58 h28" />
      <circle cx="85" cy="84" r="11" />
      <path d="M85 95 C58 125 52 180 46 210 L124 210 C118 180 112 125 85 95z" />
      <path d="M124 92 v80 M114 104 h20 M116 116 h16 M118 128 h12" strokeWidth={2} />
      <g transform="translate(62 214) rotate(-30)">
        <circle r="7" />
        <path d="M5 4 l24 0 M22 4 v6 M27 4 v6" />
      </g>
      <g transform="translate(108 214) rotate(30) scale(-1 1)">
        <circle r="7" />
        <path d="M5 4 l24 0 M22 4 v6 M27 4 v6" />
      </g>
    </>
  ),
  6: (
    <>
      <circle cx="85" cy="40" r="14" />
      {rays(85, 40, 18, 28, 12)}
      <path d="M60 70 C40 58 22 66 18 84 C40 80 52 82 70 92 M110 70 C130 58 148 66 152 84 C130 80 118 82 100 92" />
      <circle cx="85" cy="82" r="8" />
      <circle cx="48" cy="132" r="9" />
      <path d="M48 141 L46 210 M48 155 L30 176 M48 155 L66 168" />
      <circle cx="122" cy="132" r="9" />
      <path d="M122 141 L124 210 M122 155 L140 176 M122 155 L104 168" />
      <path
        d="M85 186 c-8-12-24-4-14 10 l14 14 l14-14 c10-14-6-22-14-10z"
        fill="currentColor"
        fillOpacity=".4"
      />
      <path d="M30 230 q55-30 110 0" opacity=".5" />
    </>
  ),
  7: (
    <>
      {[0, 1, 2, 3, 4].map((i) => star(41 + i * 22, 30, 4, i))}
      <path d="M30 40 h110 v14 h-110z" />
      <path d="M38 54 v52 M132 54 v52" />
      <rect x="32" y="106" width="106" height="64" rx="4" />
      <circle cx="85" cy="86" r="12" />
      <path d="M85 98 v8" />
      <path d="M70 130 h30 M85 118 v28" />
      <circle cx="50" cy="196" r="18" fill="currentColor" fillOpacity=".55" />
      <circle cx="120" cy="196" r="18" />
      <path d="M44 192 h12 M114 192 h12" />
      <path d="M0 224 h170" opacity=".4" />
    </>
  ),
  8: (
    <>
      <path d="M66 34 c0-12 19-12 19 0 c0 12 19 12 19 0 c0-12-19-12-19 0 c0 12-19 12-19 0z" />
      <circle cx="56" cy="90" r="10" />
      <path d="M56 100 C46 140 40 180 36 214 L80 214 C78 180 74 140 60 104" />
      <path d="M64 118 L104 140" />
      <circle cx="116" cy="146" r="26" fill="currentColor" fillOpacity=".2" />
      {rays(116, 146, 26, 36, 18)}
      <circle cx="108" cy="140" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="124" cy="140" r="2.4" fill="currentColor" stroke="none" />
      <path d="M108 156 q8 6 16 0" />
      <path d="M92 172 q-6 30-2 46 M140 172 q8 30 4 46" />
      <path d="M20 230 q30-12 60 0 q30-12 60 0" opacity=".5" />
    </>
  ),
  9: (
    <>
      <path d="M0 230 L60 120 L100 170 L130 140 L170 230" opacity=".4" />
      <circle cx="74" cy="66" r="10" />
      <path d="M64 58 L74 40 L84 58" />
      <path d="M74 76 C60 110 54 170 50 214 L100 214 C96 170 92 110 80 80" />
      <path d="M50 96 L44 220" strokeWidth={3} />
      <path d="M100 104 h24 v30 h-24z" />
      <path d="M104 100 l8-8 l8 8" />
      <g color="#fff2c6">{star(112, 119, 9)}</g>
      <path d="M86 98 L100 110" />
      {[0, 1, 2].map((i) => star(30 + i * 50, 22 + (i % 2) * 10, 3, i))}
    </>
  ),
  10: (
    <>
      <circle cx="85" cy="118" r="56" />
      <circle cx="85" cy="118" r="40" />
      <circle cx="85" cy="118" r="10" fill="currentColor" fillOpacity=".4" />
      {rays(85, 118, 10, 56, 8)}
      {['T', 'A', 'R', 'O'].map((l, i) => {
        const a = -Math.PI / 2 + (Math.PI / 2) * i;
        return (
          <text
            key={l}
            x={85 + 48 * Math.cos(a)}
            y={122 + 48 * Math.sin(a)}
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            stroke="none"
          >
            {l}
          </text>
        );
      })}
      <path d="M85 50 l-8 -16 h16z" fill="currentColor" fillOpacity=".4" />
      <path d="M30 190 q-14 10-6 24 q20 6 26-10" />
      <path d="M140 46 q14-10 6-24" />
      <path d="M10 30 q12-10 24 0 q12-10 24 0 M112 214 q12-10 24 0 q12-10 24 0" opacity=".5" />
    </>
  ),
  11: (
    <>
      <path d="M85 14 v120" strokeWidth={3} />
      <path d="M72 120 h26 M85 14 l-5 10 h10z" />
      <path d="M30 70 h110 M85 62 v8" />
      <path d="M30 70 L16 112 h28z M140 70 L126 112 h28z" />
      <path d="M16 112 a14 8 0 0 0 28 0 M126 112 a14 8 0 0 0 28 0" />
      <circle cx="85" cy="150" r="10" />
      <path d="M85 160 C64 188 60 210 56 230 L114 230 C110 210 106 188 85 160z" />
      <path d="M40 30 v180 M130 30 v180" opacity=".35" />
    </>
  ),
  12: (
    <>
      <path d="M20 30 h130 M40 30 v190 M130 30 v190" strokeWidth={3} />
      <path d="M36 22 q4-8 10 0 M126 22 q4-8 10 0" opacity=".6" />
      {/* rope, then a figure hanging by one foot: the other leg bent into a 4 */}
      <path d="M85 30 v20" />
      <path d="M80 50 h10" strokeWidth={2.4} />
      <path d="M85 50 L85 92 M85 66 L104 70 L96 90" />
      <path
        d="M85 92 C74 100 74 120 85 128 C96 120 96 100 85 92z"
        fill="currentColor"
        fillOpacity=".3"
      />
      <path d="M85 98 L70 116 L84 126 M85 98 L100 116 L86 126" />
      <circle cx="85" cy="142" r="12" />
      <circle cx="85" cy="144" r="22" opacity=".6" />
      {rays(85, 144, 24, 32, 14)}
    </>
  ),
  13: (
    <>
      <path d="M10 210 v-90 h22 v90 M138 210 v-90 h22 v90" />
      <path d="M10 120 l11-12 l11 12 M138 120 l11-12 l11 12" />
      <path d="M32 190 a53 53 0 0 1 106 0" />
      {rays(85, 190, 58, 72, 12)}
      <path d="M0 196 h170" />
      <path d="M85 30 v150" strokeWidth={2.4} />
      <path d="M85 34 h46 l-8 16 l8 16 h-46" />
      <path
        d="M108 50 c-6-6-14 0-8 6 c-6 6 2 12 8 6 c6 6 14 0 8-6 c6-6-2-12-8-6z"
        fill="currentColor"
        fillOpacity=".35"
      />
      <path d="M60 226 q25 10 50 0" opacity=".5" />
    </>
  ),
  14: (
    <>
      <circle cx="85" cy="46" r="10" />
      <circle cx="85" cy="46" r="18" opacity=".5" />
      <path d="M60 70 C34 50 18 70 14 96 C34 88 50 92 66 104 M110 70 C136 50 152 70 156 96 C136 88 120 92 104 104" />
      <path d="M85 60 C64 90 60 150 56 200 L114 200 C110 150 106 90 85 60z" />
      <path d="M77 112 l8-14 l8 14z" />
      <rect x="74" y="98" width="22" height="22" opacity=".5" />
      <path d="M40 120 h22 l-3 18 h-16z M108 150 h22 l-3 18 h-16z" />
      <path d="M58 126 C80 120 100 136 112 152" strokeDasharray="3 4" />
      <path d="M0 220 q40-16 80 0 q40 16 90 0" opacity=".5" />
      <path d="M130 214 q4-18 0-30 q-4 12 0 30" />
    </>
  ),
  15: (
    <>
      <g strokeWidth={2.2}>{pentagram(85, 40, 22, true)}</g>
      <circle cx="85" cy="40" r="26" opacity=".5" />
      <path d="M50 92 C40 70 52 58 66 74 M120 92 C130 70 118 58 104 74" />
      <circle cx="85" cy="96" r="20" />
      <path d="M77 92 l4 3 M93 92 l-4 3" />
      <path d="M40 130 c20 10 70 10 90 0 l-10 40 h-70z" />
      <path d="M60 170 v20 M110 170 v20" />
      <circle cx="40" cy="200" r="8" />
      <circle cx="130" cy="200" r="8" />
      <path d="M40 208 v30 M130 208 v30" />
      <path d="M60 190 C56 196 48 196 44 194 M110 190 c4 6 12 6 16 4" strokeDasharray="2 3" />
    </>
  ),
  16: (
    <>
      <path d="M58 220 L64 70 L106 70 L112 220" />
      <path d="M58 70 h54 l-4 -12 h-46z" />
      <path d="M68 58 l6-18 l6 10 l8-14 l6 12 l8-8 l4 14" />
      <path d="M80 110 h10 v18 h-10z M78 160 h14 v20 h-14z" />
      <path d="M150 6 L120 46 L136 48 L100 96" strokeWidth={2.6} />
      <path d="M40 92 C34 120 30 150 26 176 M134 108 C140 140 146 160 150 188" />
      <circle cx="26" cy="186" r="6" />
      <circle cx="150" cy="198" r="6" />
      {Array.from({ length: 10 }, (_, i) => (
        <circle
          key={i}
          cx={20 + ((i * 47) % 140)}
          cy={30 + ((i * 29) % 70)}
          r="2"
          fill="currentColor"
          stroke="none"
        />
      ))}
      <path d="M0 228 h170" opacity=".5" />
    </>
  ),
  17: (
    <>
      <g color="#fff2c6">{star(85, 46, 30)}</g>
      {[
        [26, 22],
        [146, 22],
        [20, 78],
        [150, 78],
        [42, 116],
        [128, 116],
        [85, 96],
      ].map(([x, y], i) => star(x, y, 8, i))}
      <circle cx="74" cy="148" r="9" />
      <path d="M74 157 C70 180 66 196 60 214 M74 170 L52 184 M74 170 L100 178" />
      <path d="M44 180 h14 l-3 10 h-8z M98 172 h14 l-3 10 h-8z" />
      <path
        d="M50 190 C46 206 40 216 36 226 M106 184 C112 204 122 214 134 222"
        strokeDasharray="2 3"
      />
      <path d="M0 226 q40-10 85 0 q45 10 85 0" />
    </>
  ),
  18: (
    <>
      <circle cx="85" cy="54" r="30" />
      <path d="M95 30 a26 26 0 1 0 0 48 a32 32 0 0 1 0-48z" fill="currentColor" fillOpacity=".35" />
      {Array.from({ length: 7 }, (_, i) => (
        <path key={i} d={`M${48 + i * 12} ${96 + (i % 2) * 6} l3 6 l-3 4 l-3 -4z`} />
      ))}
      <path d="M8 200 v-74 h18 v74 M144 200 v-74 h18 v74" />
      <path d="M8 126 l9-10 l9 10 M144 126 l9-10 l9 10" />
      <path d="M85 204 C78 170 92 150 85 120" strokeDasharray="4 3" />
      <path d="M40 186 l10-12 l6 14 M122 186 l10-12 l6 14" opacity=".7" />
      <path d="M0 210 q40-10 85 0 q45 10 85 0" />
      <path d="M72 226 c4-10 22-10 26 0 c-4 6-22 6-26 0z" />
    </>
  ),
  19: (
    <>
      <circle cx="85" cy="70" r="36" fill="currentColor" fillOpacity=".25" />
      {rays(85, 70, 40, 58, 24)}
      <circle cx="73" cy="64" r="3" fill="currentColor" stroke="none" />
      <circle cx="97" cy="64" r="3" fill="currentColor" stroke="none" />
      <path d="M70 82 q15 12 30 0" />
      <path d="M0 170 h170" />
      {[20, 46, 124, 150].map((x, i) => (
        <g key={i}>
          <circle cx={x} cy="152" r="7" />
          {rays(x, 152, 7, 12, 10)}
          <path d={`M${x} 159 v11`} />
        </g>
      ))}
      <circle cx="85" cy="148" r="9" />
      <path d="M85 157 v32 M85 166 L66 152 M85 166 L104 152 M85 189 L74 212 M85 189 L96 212" />
      <path d="M104 152 L120 120 M120 120 h20 l-4 8 l4 8 h-20" />
    </>
  ),
  20: (
    <>
      <path d="M10 40 q20-16 40 0 q20-16 40 0 q20-16 40 0 q20-16 30 0" opacity=".6" />
      <path d="M36 66 L120 22 L126 34 L42 78z" />
      <path d="M120 22 l20 -8 l-4 30 z" />
      <path d="M70 58 h18 v14 h-18z M79 58 v14 M70 65 h18" opacity=".8" />
      {[30, 85, 140].map((x, i) => (
        <g key={i}>
          <rect x={x - 20} y="186" width="40" height="22" />
          <circle cx={x} cy="150" r="9" />
          <path d={`M${x} 159 v27 M${x} 168 l-16 -22 M${x} 168 l16 -22`} />
        </g>
      ))}
      <path d="M0 222 q40-12 85 0 q45 12 85 0" />
    </>
  ),
  21: (
    <>
      <ellipse cx="85" cy="122" rx="48" ry="82" />
      {Array.from({ length: 22 }, (_, i) => {
        const a = (2 * Math.PI * i) / 22;
        const x = 85 + 48 * Math.cos(a),
          y = 122 + 82 * Math.sin(a);
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx="4"
            ry="8"
            transform={`rotate(${(a * 180) / Math.PI} ${x} ${y})`}
            fill="currentColor"
            fillOpacity=".3"
          />
        );
      })}
      <circle cx="85" cy="84" r="9" />
      <path d="M85 93 C82 120 84 140 88 160 M88 160 L74 196 M88 160 L104 184 L94 196 M85 106 L66 92 M85 106 L106 118" />
      <path d="M66 92 C58 120 112 130 106 118" strokeDasharray="3 3" />
      {[
        [16, 22],
        [154, 22],
        [16, 222],
        [154, 222],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="11" />
          {star(x, y, 5)}
        </g>
      ))}
    </>
  ),
};

/* ------------------------------------------------------------ minor layouts */
// Classic pip positions in the 170×240 art box.
const pips: Record<number, [number, number, boolean?][]> = {
  2: [
    [85, 50],
    [85, 190, true],
  ],
  3: [
    [85, 40],
    [85, 120],
    [85, 200, true],
  ],
  4: [
    [45, 50],
    [125, 50],
    [45, 190, true],
    [125, 190, true],
  ],
  5: [
    [45, 50],
    [125, 50],
    [85, 120],
    [45, 190, true],
    [125, 190, true],
  ],
  6: [
    [45, 45],
    [125, 45],
    [45, 120],
    [125, 120],
    [45, 195, true],
    [125, 195, true],
  ],
  7: [
    [45, 40],
    [125, 40],
    [85, 80],
    [45, 120],
    [125, 120],
    [45, 200, true],
    [125, 200, true],
  ],
  8: [
    [45, 38],
    [125, 38],
    [85, 78],
    [45, 120],
    [125, 120],
    [85, 162, true],
    [45, 202, true],
    [125, 202, true],
  ],
  9: [
    [45, 36],
    [125, 36],
    [45, 92],
    [125, 92],
    [85, 120],
    [45, 148, true],
    [125, 148, true],
    [45, 204, true],
    [125, 204, true],
  ],
  10: [
    [45, 34],
    [125, 34],
    [85, 66],
    [45, 98],
    [125, 98],
    [45, 142, true],
    [125, 142, true],
    [85, 174, true],
    [45, 206, true],
    [125, 206, true],
  ],
};
function courtFigure(rank: number) {
  switch (rank) {
    case 11: // Page: a young messenger holding up the suit
      return (
        <>
          <circle cx="85" cy="150" r="9" />
          <path d="M76 146 q9-10 18 0" />
          <path d="M85 159 C74 186 72 204 70 226 L100 226 C98 204 96 186 85 159z" />
          <path d="M85 172 L66 148 M85 172 L104 148" />
        </>
      );
    case 12: // Knight: a horse head
      return (
        <>
          <path d="M66 228 C62 200 70 182 84 172 C78 168 70 168 64 160 C60 152 70 140 82 142 L92 132 L96 142 C112 150 116 180 110 228z" />
          <path d="M92 132 l4-12 l6 14" />
          <circle cx="80" cy="152" r="2" fill="currentColor" stroke="none" />
          <path d="M96 150 C104 168 104 190 100 210" opacity=".6" />
        </>
      );
    case 13: // Queen: a crown with an orb and veil
      return (
        <>
          <path d="M56 186 L60 152 L72 170 L85 146 L98 170 L110 152 L114 186z" />
          <path d="M56 186 h58 v10 h-58z" />
          <circle cx="85" cy="138" r="6" />
          <path d="M50 200 C60 214 110 214 120 200" opacity=".6" />
          {[60, 85, 110].map((x, i) => (
            <circle
              key={i}
              cx={x}
              cy={i === 1 ? 146 : 152}
              r="2.4"
              fill="currentColor"
              stroke="none"
            />
          ))}
        </>
      );
    default: // King: a crown with a cross and a throne line
      return (
        <>
          <path d="M52 192 L56 150 L70 168 L85 142 L100 168 L114 150 L118 192z" />
          <path d="M52 192 h66 v12 h-66z" />
          <path d="M85 142 v-18 M78 130 h14" strokeWidth={2.4} />
          <path d="M40 216 h90 M46 216 v14 M124 216 v14" opacity=".6" />
        </>
      );
  }
}
function minorArt(card: TarotCard) {
  const suit = card.suit!;
  if (card.rank === 1)
    return (
      <>
        <circle cx="85" cy="120" r="62" opacity=".35" />
        {rays(85, 120, 66, 82, 24)}
        <Glyph suit={suit} x={85} y={120} s={4.6} />
        <path d="M20 226 q30-12 65 0 q35 12 65 0" opacity=".5" />
      </>
    );
  if (card.rank <= 10)
    return (
      <>
        {pips[card.rank].map(([x, y, flip], i) => (
          <Glyph
            key={i}
            suit={suit}
            x={x}
            y={y}
            s={card.rank >= 9 ? 1.55 : card.rank >= 7 ? 1.75 : 2.1}
            flip={flip}
          />
        ))}
      </>
    );
  return (
    <>
      <circle cx="85" cy="70" r="40" opacity=".35" />
      <Glyph suit={suit} x={85} y={70} s={2.7} />
      {courtFigure(card.rank)}
    </>
  );
}

/* ------------------------------------------------------------ card face + back */
function Frame({ gold, glow }: { gold: string; glow: string }) {
  return (
    <>
      <rect
        x="6"
        y="6"
        width={W - 12}
        height={H - 12}
        rx="12"
        fill="none"
        stroke={`url(#${gold})`}
        strokeWidth="2.4"
      />
      <rect
        x="13"
        y="13"
        width={W - 26}
        height={H - 26}
        rx="8"
        fill="none"
        stroke={`url(#${gold})`}
        strokeWidth=".9"
        opacity=".8"
      />
      {[
        [13, 13, 0],
        [W - 13, 13, 90],
        [W - 13, H - 13, 180],
        [13, H - 13, 270],
      ].map(([x, y, r], i) => (
        <path
          key={i}
          transform={`translate(${x} ${y}) rotate(${r})`}
          d="M0 18 C6 12 12 6 18 0 M4 4 l6 6 M0 8 q8 0 8 -8"
          fill="none"
          stroke={`url(#${gold})`}
          strokeWidth="1.2"
        />
      ))}
      <circle cx={W / 2} cy="28" r="15" fill={glow} opacity=".55" />
    </>
  );
}

export function TarotCardSvg({ card, title }: { card: TarotCard; title?: string }) {
  const id = useId().replace(/:/g, '');
  const [deep, light, accent] = palettes[card.suit ?? 'MAJOR'];
  const bg = `${id}-bg`,
    gold = `${id}-gold`,
    halo = `${id}-halo`;
  const numeral = cardNumeral(card);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="tarot-svg"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset=".55" stopColor={deep} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c2" />
          <stop offset=".45" stopColor="#e3b860" />
          <stop offset=".7" stopColor="#b8862f" />
          <stop offset="1" stopColor="#f6dc93" />
        </linearGradient>
        <radialGradient id={halo} cx=".5" cy=".45" r=".55">
          <stop offset="0" stopColor={accent} stopOpacity=".38" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} rx="14" fill={`url(#${bg})`} />
      <rect x="14" y="44" width={W - 28} height="250" fill={`url(#${halo})`} />
      {/* scattered stars in the sky */}
      <g fill="#fff6dc" opacity=".55">
        {[
          [30, 60, 1.1],
          [176, 72, 1.4],
          [44, 250, 0.9],
          [168, 230, 1.2],
          [100, 54, 0.8],
          [24, 150, 1],
          [186, 160, 0.9],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} />
        ))}
      </g>
      <Frame gold={gold} glow={halo} />
      <text
        x={W / 2}
        y="34"
        textAnchor="middle"
        className="tarot-svg-numeral"
        fill={`url(#${gold})`}
      >
        {numeral}
      </text>
      <g
        transform="translate(20 50)"
        stroke={`url(#${gold})`}
        color={accent}
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {card.arcana === 'MAJOR' ? majorArt[card.rank] : minorArt(card)}
      </g>
      <path
        d={`M24 304 h${W - 48} l-8 14 l8 14 h-${W - 48} l8 -14z`}
        fill={deep}
        fillOpacity=".85"
        stroke={`url(#${gold})`}
        strokeWidth="1.2"
      />
      <text x={W / 2} y="323" textAnchor="middle" className="tarot-svg-name" fill="#fff4d6">
        {card.name}
      </text>
    </svg>
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

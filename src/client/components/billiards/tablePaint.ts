// Painting the Bi-a table on a 2D canvas, in table units (1000 × 500 cloth, origin at the top-left
// corner of the cloth). The static table is painted once into a cache; balls and the cue are painted
// every frame on top of it.
import { HEAD_STRING } from '../../../shared/billiards/engine';
import { H, POCKETS, R, W, type Ball } from '../../../shared/billiards/physics';

export const RAIL = 44;
/** Cushion depth between the wooden rail and the cloth. */
const CUSHION = 15;

const POOL_BALLS: Record<number, string> = {
  1: '#f4c21b',
  2: '#1e4fd6',
  3: '#d92b26',
  4: '#5b2a9e',
  5: '#f2711c',
  6: '#13804a',
  7: '#7c1c1c',
  8: '#141414',
};
const CAROM_BALLS = ['#f7f4ea', '#f4c21b', '#d92b26'];

/** Toward the lamp, in table units: the top-left of the screen whichever way the table is turned. */
export const lightFor = (vertical: boolean) => (vertical ? { x: 1, y: -1 } : { x: -1, y: -1 });

/** A small seeded generator so the felt and grain look the same on every repaint. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

let feltTile: HTMLCanvasElement | null = null;
/** A tile of fine fibres that gives the cloth its woven look. */
function felt() {
  if (feltTile) return feltTile;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 96;
  const ctx = tile.getContext('2d')!;
  const rand = seeded(11);
  for (let i = 0; i < 1400; i++) {
    const light = rand() > 0.5;
    ctx.fillStyle = light
      ? `rgba(255,255,255,${0.02 + rand() * 0.04})`
      : `rgba(0,0,0,${0.03 + rand() * 0.05})`;
    ctx.fillRect(rand() * 96, rand() * 96, 1 + rand() * 1.5, 0.6 + rand() * 0.6);
  }
  feltTile = tile;
  return tile;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Screen-space centre and size of each pocket opening (slightly outside the cloth). */
function holes() {
  return POCKETS.map((p) => {
    const side = p.x === W / 2;
    return {
      x: side ? p.x : p.x === 0 ? -7 : W + 7,
      y: p.y <= 0 ? (side ? -13 : -7) : side ? H + 13 : H + 7,
      r: side ? 21 : 25,
      side,
    };
  });
}

/** Wooden frame, cushions, cloth, lamps, pockets and markings. */
export function paintTable(ctx: CanvasRenderingContext2D, carom: boolean) {
  const cloth = carom ? ['#3b86d6', '#2766ad', '#17457a'] : ['#2fae69', '#1f8a51', '#125e36'];
  const cushion = carom ? '#1d5797' : '#167444';

  // Shadow of the table on the page.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, -RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, 26);
  ctx.fillStyle = '#3a1d0b';
  ctx.fill();
  ctx.restore();

  // Rails: dark walnut with long grain and a polished bevel.
  const wood = ctx.createLinearGradient(0, -RAIL, 0, H + RAIL);
  wood.addColorStop(0, '#7a4521');
  wood.addColorStop(0.08, '#5e3216');
  wood.addColorStop(0.5, '#6a3a1a');
  wood.addColorStop(0.92, '#4f2810');
  wood.addColorStop(1, '#3d1e0b');
  roundRect(ctx, -RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, 26);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const rand = seeded(5);
  for (let i = 0; i < 70; i++) {
    const horizontal = i < 46;
    ctx.strokeStyle = `rgba(${rand() > 0.5 ? '255,210,160' : '30,12,2'},${0.05 + rand() * 0.07})`;
    ctx.lineWidth = 0.6 + rand() * 1.6;
    ctx.beginPath();
    if (horizontal) {
      const y =
        rand() > 0.5 ? -RAIL + rand() * (RAIL - CUSHION) : H + CUSHION + rand() * (RAIL - CUSHION);
      ctx.moveTo(-RAIL, y);
      ctx.bezierCurveTo(W * 0.3, y + rand() * 6 - 3, W * 0.7, y + rand() * 6 - 3, W + RAIL, y);
    } else {
      const x =
        rand() > 0.5 ? -RAIL + rand() * (RAIL - CUSHION) : W + CUSHION + rand() * (RAIL - CUSHION);
      ctx.moveTo(x, -RAIL);
      ctx.bezierCurveTo(x + rand() * 6 - 3, H * 0.3, x + rand() * 6 - 3, H * 0.7, x, H + RAIL);
    }
    ctx.stroke();
  }
  ctx.restore();
  // Bevel: light along the outer edge, a darker lip where the rail meets the cushion.
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,220,180,0.22)';
  roundRect(ctx, -RAIL + 2, -RAIL + 2, W + 2 * RAIL - 4, H + 2 * RAIL - 4, 24);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3;
  ctx.strokeRect(-CUSHION - 1.5, -CUSHION - 1.5, W + 2 * CUSHION + 3, H + 2 * CUSHION + 3);

  // Cloth.
  const base = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.62);
  base.addColorStop(0, cloth[0]);
  base.addColorStop(0.65, cloth[1]);
  base.addColorStop(1, cloth[2]);
  ctx.fillStyle = base;
  ctx.fillRect(-CUSHION, -CUSHION, W + 2 * CUSHION, H + 2 * CUSHION);
  const pattern = ctx.createPattern(felt(), 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(-CUSHION, -CUSHION, W + 2 * CUSHION, H + 2 * CUSHION);
  }
  // Two lamps hang over the table.
  for (const lx of [W * 0.3, W * 0.7]) {
    const lamp = ctx.createRadialGradient(lx, H / 2, 10, lx, H / 2, 330);
    lamp.addColorStop(0, 'rgba(255,250,225,0.16)');
    lamp.addColorStop(1, 'rgba(255,250,225,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(-CUSHION, -CUSHION, W + 2 * CUSHION, H + 2 * CUSHION);
  }

  // Cushions: rubber noses that taper into each pocket mouth.
  const pockets = carom ? [] : holes();
  // Each cushion: its span and how far it stops short of the pocket at either end.
  const corner = carom ? 0 : 30,
    middle = 24;
  const segments: [number, number, 'top' | 'bottom' | 'left' | 'right', number, number][] = carom
    ? [
        [0, W, 'top', 0, 0],
        [0, W, 'bottom', 0, 0],
        [0, H, 'left', 0, 0],
        [0, H, 'right', 0, 0],
      ]
    : [
        [0, W / 2, 'top', corner, middle],
        [W / 2, W, 'top', middle, corner],
        [0, W / 2, 'bottom', corner, middle],
        [W / 2, W, 'bottom', middle, corner],
        [0, H, 'left', corner, corner],
        [0, H, 'right', corner, corner],
      ];
  for (const [from, to, edge, gapA, gapB] of segments) {
    const a = from + gapA,
      b = to - gapB;
    const taper = carom ? 0 : 9;
    ctx.beginPath();
    if (edge === 'top') {
      ctx.moveTo(a - taper, -CUSHION);
      ctx.lineTo(b + taper, -CUSHION);
      ctx.lineTo(b, 0);
      ctx.lineTo(a, 0);
    } else if (edge === 'bottom') {
      ctx.moveTo(a - taper, H + CUSHION);
      ctx.lineTo(b + taper, H + CUSHION);
      ctx.lineTo(b, H);
      ctx.lineTo(a, H);
    } else if (edge === 'left') {
      ctx.moveTo(-CUSHION, a - taper);
      ctx.lineTo(-CUSHION, b + taper);
      ctx.lineTo(0, b);
      ctx.lineTo(0, a);
    } else {
      ctx.moveTo(W + CUSHION, a - taper);
      ctx.lineTo(W + CUSHION, b + taper);
      ctx.lineTo(W, b);
      ctx.lineTo(W, a);
    }
    ctx.closePath();
    const inward =
      edge === 'top'
        ? ctx.createLinearGradient(0, -CUSHION, 0, 0)
        : edge === 'bottom'
          ? ctx.createLinearGradient(0, H + CUSHION, 0, H)
          : edge === 'left'
            ? ctx.createLinearGradient(-CUSHION, 0, 0, 0)
            : ctx.createLinearGradient(W + CUSHION, 0, W, 0);
    inward.addColorStop(0, cushion);
    inward.addColorStop(0.7, cushion);
    inward.addColorStop(1, carom ? '#4f97e0' : '#3cc27c');
    ctx.fillStyle = inward;
    ctx.fill();
  }
  // The cushion's shadow falls on the cloth along every edge.
  const edgeShade = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };
  edgeShade(0, 0, 0, 10, 0, 0, W, 10);
  edgeShade(0, H, 0, H - 6, 0, H - 6, W, 6);
  edgeShade(0, 0, 10, 0, 0, 0, 10, H);
  edgeShade(W, 0, W - 6, 0, W - 6, 0, 6, H);

  // Pockets: a leather-lined drop into darkness.
  for (const p of pockets) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
    const rim = ctx.createRadialGradient(p.x, p.y, p.r - 2, p.x, p.y, p.r + 6);
    rim.addColorStop(0, '#2a1a10');
    rim.addColorStop(0.6, '#4a2e1c');
    rim.addColorStop(1, 'rgba(60,35,20,0)');
    ctx.fillStyle = rim;
    ctx.fill();
    const hole = ctx.createRadialGradient(p.x - 4, p.y - 4, 2, p.x, p.y, p.r);
    hole.addColorStop(0, '#000');
    hole.addColorStop(0.75, '#050505');
    hole.addColorStop(1, '#1f1f1f');
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Mother-of-pearl sights on the rails.
  const sight = (x: number, y: number) => {
    const g = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, 4.5);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#efe6d2');
    g.addColorStop(1, '#b9ac90');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y - 4.5);
    ctx.lineTo(x + 3.2, y);
    ctx.lineTo(x, y + 4.5);
    ctx.lineTo(x - 3.2, y);
    ctx.closePath();
    ctx.fill();
  };
  const mid = (RAIL + CUSHION) / 2;
  for (let i = 1; i < 8; i++) {
    if (i === 4 && !carom) continue;
    sight((W * i) / 8, -mid);
    sight((W * i) / 8, H + mid);
  }
  for (let i = 1; i < 4; i++) {
    sight(-mid, (H * i) / 4);
    sight(W + mid, (H * i) / 4);
  }
  // Head and foot spots.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const x of [W / 4, (W * 3) / 4]) {
    ctx.beginPath();
    ctx.arc(x, H / 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The head string, while the cue ball must be placed behind it. */
export function paintKitchen(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(HEAD_STRING, 0);
  ctx.lineTo(HEAD_STRING, H);
  ctx.stroke();
  ctx.restore();
}

/** Soft shadows on the cloth, away from the lamps. */
export function paintShadow(
  ctx: CanvasRenderingContext2D,
  b: Ball,
  light: { x: number; y: number },
) {
  const x = b.x - light.x * 3.5,
    y = b.y - light.y * 3.5;
  const g = ctx.createRadialGradient(x, y, R * 0.3, x, y, R * 1.25);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R * 1.25, 0, Math.PI * 2);
  ctx.fill();
}

/** A glossy ball: colour, stripe, number disc, shading and the lamp's reflection. */
export function paintBall(
  ctx: CanvasRenderingContext2D,
  b: Ball,
  carom: boolean,
  vertical: boolean,
) {
  const light = lightFor(vertical);
  const color = carom
    ? CAROM_BALLS[b.n]
    : b.n === 0
      ? '#f7f4ea'
      : POOL_BALLS[b.n > 8 ? b.n - 8 : b.n];
  const stripe = !carom && b.n > 8;
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = stripe ? '#f7f4ea' : color;
  ctx.fillRect(b.x - R, b.y - R, 2 * R, 2 * R);
  if (stripe) {
    ctx.fillStyle = color;
    // The band runs across the screen whichever way the table is turned.
    if (vertical) ctx.fillRect(b.x - R * 0.56, b.y - R, R * 1.12, 2 * R);
    else ctx.fillRect(b.x - R, b.y - R * 0.56, 2 * R, R * 1.12);
  }
  if (!carom && b.n > 0) {
    ctx.fillStyle = '#fbf9f2';
    ctx.beginPath();
    ctx.arc(b.x, b.y, R * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(b.x, b.y);
    if (vertical) ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#111';
    ctx.font = `800 ${R * 0.6}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.n), 0, 0.6);
    ctx.restore();
  }
  // Shading: lit toward the lamp, darker toward the far edge.
  const hx = b.x + light.x * R * 0.38,
    hy = b.y + light.y * R * 0.38;
  const shade = ctx.createRadialGradient(hx, hy, R * 0.05, b.x, b.y, R * 1.05);
  shade.addColorStop(0, 'rgba(255,255,255,0.35)');
  shade.addColorStop(0.35, 'rgba(255,255,255,0.05)');
  shade.addColorStop(0.7, 'rgba(0,0,0,0.05)');
  shade.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = shade;
  ctx.fillRect(b.x - R, b.y - R, 2 * R, 2 * R);
  // Light bounced off the cloth along the lower edge.
  const bounce = ctx.createRadialGradient(
    b.x - light.x * R * 0.7,
    b.y - light.y * R * 0.7,
    0,
    b.x - light.x * R * 0.7,
    b.y - light.y * R * 0.7,
    R * 0.6,
  );
  bounce.addColorStop(0, 'rgba(255,255,255,0.12)');
  bounce.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bounce;
  ctx.fillRect(b.x - R, b.y - R, 2 * R, 2 * R);
  ctx.restore();
  // The lamp's sharp reflection, near the rim so it never covers the number.
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.ellipse(
    b.x + light.x * R * 0.5,
    b.y + light.y * R * 0.5,
    R * 0.17,
    R * 0.1,
    Math.atan2(light.y, light.x) + Math.PI / 2,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

/**
 * The cue: blue-chalked tip, white ferrule, maple shaft, dark wrap and a rosewood butt, with its
 * shadow on the cloth. `back` is how far the tip sits behind the ball.
 */
export function paintCue(
  ctx: CanvasRenderingContext2D,
  cue: Ball,
  ux: number,
  uy: number,
  back: number,
  light: { x: number; y: number },
) {
  const tip = R + 4 + back;
  const at = (d: number) => ({ x: cue.x - ux * (tip + d), y: cue.y - uy * (tip + d) });
  const nx = -uy,
    ny = ux;
  const part = (
    from: number,
    to: number,
    w0: number,
    w1: number,
    fill: string | CanvasGradient,
  ) => {
    const a = at(from),
      b = at(to);
    ctx.beginPath();
    ctx.moveTo(a.x + nx * w0, a.y + ny * w0);
    ctx.lineTo(b.x + nx * w1, b.y + ny * w1);
    ctx.lineTo(b.x - nx * w1, b.y - ny * w1);
    ctx.lineTo(a.x - nx * w0, a.y - ny * w0);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const length = 360;
  // Shadow.
  ctx.save();
  ctx.translate(-light.x * 6, -light.y * 6);
  ctx.globalAlpha = 0.25;
  part(0, length, 2.6, 4.6, '#000');
  ctx.restore();
  // Across-the-shaft shading makes the cue look round.
  const round = (base: string) => {
    const a = at(0);
    const g = ctx.createLinearGradient(a.x + nx * 5, a.y + ny * 5, a.x - nx * 5, a.y - ny * 5);
    g.addColorStop(0, base);
    g.addColorStop(0.35, 'rgba(255,255,255,0.0)');
    g.addColorStop(1, base);
    return g;
  };
  part(0, 4, 2.4, 2.5, '#3f6fd0');
  part(4, 14, 2.5, 2.6, '#f2efe6');
  part(14, 220, 2.6, 3.6, '#e3c48d');
  part(220, 232, 3.6, 3.7, '#f5f1e6');
  part(232, 300, 3.7, 4.2, '#1d1a18');
  part(300, length, 4.2, 4.6, '#4a1f12');
  part(0, length, 2.6, 4.6, round('rgba(0,0,0,0.25)'));
  // A thin highlight along the top of the cue.
  const a = at(4),
    b = at(length);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(a.x + nx * 1.2, a.y + ny * 1.2);
  ctx.lineTo(b.x + nx * 2.2, b.y + ny * 2.2);
  ctx.stroke();
}

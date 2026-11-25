// Printed artwork for the Tỷ Phú board, drawn once on a canvas and shared by the 3D table
// (as the board's top texture) and the 2D board (as the centre map).
import { board, type Tile } from '../../../shared/ty-phu/board';
import { stripColor, tilePosition } from './tile-layout';

export const INK = '#3b2a1a';
export const PAPER = '#f1e2c0';
const SANS = '"Segoe UI", "Be Vietnam Pro", system-ui, sans-serif';
const SERIF = '"Noto Serif", Cambria, "Times New Roman", serif';

/** Deterministic random numbers so the printed board looks the same every time. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Aged paper: warm base, speckles and a few faint stains. */
function paper(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed = 3) {
  const random = seeded(seed);
  const base = c.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 0.75);
  base.addColorStop(0, '#f4e6c6');
  base.addColorStop(1, '#dcc394');
  c.fillStyle = base;
  c.fillRect(x, y, w, h);
  for (let i = 0; i < 6; i++) {
    const sx = x + random() * w,
      sy = y + random() * h,
      r = 40 + random() * w * 0.18;
    const stain = c.createRadialGradient(sx, sy, 0, sx, sy, r);
    stain.addColorStop(0, 'rgba(150,110,60,0.08)');
    stain.addColorStop(1, 'rgba(150,110,60,0)');
    c.fillStyle = stain;
    c.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  for (let i = 0; i < (w * h) / 900; i++) {
    c.fillStyle = `rgba(90,60,30,${0.03 + random() * 0.06})`;
    c.fillRect(x + random() * w, y + random() * h, 1 + random() * 2, 1 + random() * 2);
  }
}

/** The old-town map in the middle of the board: streets, a winding river and the title. */
export function drawCenterMap(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const h = w;
  const random = seeded(11);
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  paper(c, x, y, w, h, 7);
  // Parks and blocks.
  for (let i = 0; i < 14; i++) {
    c.fillStyle = i % 3 ? 'rgba(186,160,112,0.25)' : 'rgba(150,170,110,0.28)';
    const bw = w * (0.05 + random() * 0.08);
    c.fillRect(x + random() * (w - bw), y + random() * (h - bw), bw, bw * (0.6 + random() * 0.6));
  }
  // Street grid, slightly skewed like an old survey map.
  c.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const major = i % 5 === 0;
    c.strokeStyle = major ? 'rgba(120,88,52,0.55)' : 'rgba(140,108,70,0.35)';
    c.lineWidth = (major ? 0.009 : 0.004) * w;
    const t = (i + random() * 0.6) / 26;
    c.beginPath();
    if (i % 2) {
      c.moveTo(x + t * w, y);
      c.lineTo(x + t * w + (random() - 0.5) * w * 0.12, y + h);
    } else {
      c.moveTo(x, y + t * h);
      c.lineTo(x + w, y + t * h + (random() - 0.5) * h * 0.12);
    }
    c.stroke();
  }
  // Two diagonal avenues.
  c.strokeStyle = 'rgba(120,88,52,0.5)';
  c.lineWidth = 0.012 * w;
  c.beginPath();
  c.moveTo(x, y + h * 0.15);
  c.lineTo(x + w * 0.85, y + h);
  c.moveTo(x + w * 0.3, y);
  c.lineTo(x + w, y + h * 0.62);
  c.stroke();
  // The river: dark bank, water, highlight.
  const river = (offset: number) => {
    c.beginPath();
    c.moveTo(x - 10, y + h * (0.32 + offset));
    c.bezierCurveTo(
      x + w * 0.28,
      y + h * (0.12 + offset),
      x + w * 0.38,
      y + h * (0.78 + offset),
      x + w * 0.62,
      y + h * (0.6 + offset),
    );
    c.bezierCurveTo(
      x + w * 0.8,
      y + h * (0.46 + offset),
      x + w * 0.84,
      y + h * (0.9 + offset),
      x + w + 10,
      y + h * (0.86 + offset),
    );
  };
  for (const [color, width] of [
    ['rgba(96,110,104,0.55)', 0.07],
    ['#9fb3ad', 0.055],
    ['rgba(255,255,255,0.25)', 0.012],
  ] as const) {
    c.strokeStyle = color;
    c.lineWidth = width * w;
    river(0);
    c.stroke();
  }
  // Compass rose.
  const cx = x + w * 0.14,
    cy = y + h * 0.84,
    r = w * 0.06;
  c.strokeStyle = 'rgba(107,63,31,0.7)';
  c.fillStyle = 'rgba(107,63,31,0.75)';
  c.lineWidth = w * 0.003;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.stroke();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    c.beginPath();
    c.moveTo(cx + Math.sin(a) * r * 1.25, cy - Math.cos(a) * r * 1.25);
    c.lineTo(cx + Math.sin(a + 0.35) * r * 0.3, cy - Math.cos(a + 0.35) * r * 0.3);
    c.lineTo(cx + Math.sin(a - 0.35) * r * 0.3, cy - Math.cos(a - 0.35) * r * 0.3);
    c.fill();
  }
  c.font = `700 ${w * 0.03}px ${SERIF}`;
  c.textAlign = 'center';
  c.fillText('B', cx, cy - r * 1.4);
  // Title cartouche.
  const tw = w * 0.62,
    th = h * 0.2,
    tx = x + (w - tw) / 2,
    ty = y + h * 0.1;
  c.fillStyle = 'rgba(244,230,198,0.92)';
  c.strokeStyle = '#6b3f1f';
  c.lineWidth = w * 0.004;
  c.fillRect(tx, ty, tw, th);
  c.strokeRect(tx, ty, tw, th);
  c.strokeRect(tx + w * 0.008, ty + w * 0.008, tw - w * 0.016, th - w * 0.016);
  c.fillStyle = '#7a3b1c';
  c.textBaseline = 'middle';
  c.font = `900 ${w * 0.072}px ${SERIF}`;
  c.fillText('TỶ PHÚ', x + w / 2, ty + th * 0.4);
  c.font = `700 ${w * 0.03}px ${SERIF}`;
  c.fillStyle = INK;
  c.fillText('P H Ố   N H Ạ C', x + w / 2, ty + th * 0.75);
  c.font = `italic 600 ${w * 0.024}px ${SERIF}`;
  c.fillStyle = 'rgba(59,42,26,0.75)';
  c.fillText('Hà Giang  ✦  TP. Hồ Chí Minh', x + w / 2, ty + th + h * 0.035);
  // The printed spot where the chance deck sits.
  const dx = x + w * 0.62,
    dy = y + h * 0.66,
    dw = w * 0.2,
    dh = h * 0.14;
  c.setLineDash([w * 0.012, w * 0.008]);
  c.strokeStyle = 'rgba(160,40,30,0.6)';
  c.lineWidth = w * 0.004;
  c.strokeRect(dx, dy, dw, dh);
  c.setLineDash([]);
  c.fillStyle = 'rgba(160,40,30,0.65)';
  c.font = `800 ${w * 0.026}px ${SANS}`;
  c.fillText('CƠ HỘI', dx + dw / 2, dy + dh + h * 0.03);
  // Vignette.
  const vignette = c.createRadialGradient(
    x + w / 2,
    y + h / 2,
    w * 0.35,
    x + w / 2,
    y + h / 2,
    w * 0.75,
  );
  vignette.addColorStop(0, 'rgba(80,50,20,0)');
  vignette.addColorStop(1, 'rgba(80,50,20,0.28)');
  c.fillStyle = vignette;
  c.fillRect(x, y, w, h);
  c.restore();
}

function wrap(c: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (c.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** One tile drawn in its own frame: local "up" points to the board centre. */
function drawTile(c: CanvasRenderingContext2D, t: Tile, w: number, h: number) {
  const corner = [0, 8, 16, 24].includes(t.index);
  c.fillStyle = PAPER;
  c.fillRect(-w / 2, -h / 2, w, h);
  c.strokeStyle = 'rgba(59,42,26,0.55)';
  c.lineWidth = 3;
  c.strokeRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = INK;
  if (corner) {
    const kind = t.kind as 'START' | 'JAIL' | 'FESTIVAL' | 'AIRPORT';
    const label = {
      START: 'XUẤT PHÁT',
      JAIL: 'NHÀ TÙ',
      FESTIVAL: 'ĐẠI NHẠC HỘI',
      AIRPORT: 'SÂN BAY',
    }[kind]!;
    const tint = { START: '#e24b4a', JAIL: '#5f5e5a', FESTIVAL: '#d4537e', AIRPORT: '#378add' }[
      kind
    ]!;
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.6);
    glow.addColorStop(0, tint + '55');
    glow.addColorStop(1, tint + '00');
    c.fillStyle = glow;
    c.fillRect(-w / 2, -h / 2, w, h);
    c.fillStyle = INK;
    c.font = `900 ${w * 0.12}px ${SERIF}`;
    for (const [i, line] of wrap(c, label, w * 0.8).entries())
      c.fillText(line, 0, -h * 0.28 + i * w * 0.13);
    c.font = `${w * 0.3}px ${SANS}`;
    c.fillText({ START: '🏁', JAIL: '🔒', FESTIVAL: '🎤', AIRPORT: '✈️' }[kind]!, 0, h * 0.14);
    if (t.kind === 'START') {
      c.font = `800 ${w * 0.09}px ${SANS}`;
      c.fillStyle = '#7a3b1c';
      c.fillText('NHẬN 200', 0, h * 0.38);
    }
    return;
  }
  const band = h * 0.22;
  if (t.kind === 'CITY' || t.kind === 'BEACH') {
    c.fillStyle = stripColor(t);
    c.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, band);
    c.strokeStyle = 'rgba(59,42,26,0.55)';
    c.beginPath();
    c.moveTo(-w / 2 + 3, -h / 2 + 3 + band);
    c.lineTo(w / 2 - 3, -h / 2 + 3 + band);
    c.stroke();
    if (t.kind === 'BEACH') {
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 3;
      for (let k = 0; k < 2; k++) {
        c.beginPath();
        for (let px = -w / 2 + 8; px <= w / 2 - 8; px += 4)
          c.lineTo(px, -h / 2 + band * (0.4 + k * 0.35) + Math.sin(px / 9) * 4);
        c.stroke();
      }
    }
  }
  c.fillStyle = INK;
  if (t.kind === 'CHANCE') {
    c.fillStyle = '#b3261e';
    c.font = `900 ${w * 0.55}px ${SERIF}`;
    c.fillText('?', 0, -h * 0.06);
    c.fillStyle = INK;
    c.font = `800 ${w * 0.13}px ${SANS}`;
    c.fillText('CƠ HỘI', 0, h * 0.32);
    return;
  }
  if (t.kind === 'TAX') {
    c.font = `${w * 0.32}px ${SANS}`;
    c.fillText('🧾', 0, -h * 0.12);
    c.font = `800 ${w * 0.12}px ${SANS}`;
    c.fillText('THUẾ NHÀ', 0, h * 0.17);
    c.font = `600 ${w * 0.1}px ${SANS}`;
    c.fillText('10% tài sản', 0, h * 0.33);
    return;
  }
  const name = t.name.replace('TP. Hồ Chí Minh', 'TP. HCM');
  c.font = `800 ${w * 0.15}px ${SANS}`;
  const lines = wrap(c, name.toUpperCase(), w * 0.86);
  const size = lines.length > 2 ? w * 0.12 : w * 0.15;
  c.font = `800 ${size}px ${SANS}`;
  const top = -h / 2 + band + size * 1.1;
  for (const [i, line] of wrap(c, name.toUpperCase(), w * 0.86).entries())
    c.fillText(line, 0, top + i * size * 1.1);
  if (t.kind === 'BEACH') {
    c.font = `${w * 0.26}px ${SANS}`;
    c.fillText('🏖️', 0, h * 0.14);
  }
  c.font = `700 ${w * 0.13}px ${SERIF}`;
  c.fillStyle = '#5b3a1e';
  c.fillText(String(t.price ?? ''), 0, h / 2 - w * 0.16);
}

/** Pixels per board unit and the 1.3-unit corners, matching the 2D grid. */
const UNITS = 9.6;
export const centre = (k: number) => (k === 1 ? 0.65 : k === 9 ? 8.95 : 1.8 + (k - 2)) / UNITS;

/** The whole printed top of the board, square, `size` pixels wide. */
export function drawBoard(size = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.fillStyle = PAPER;
  c.fillRect(0, 0, size, size);
  drawCenterMap(c, (1.3 / UNITS) * size, (1.3 / UNITS) * size, (7 / UNITS) * size);
  for (const t of board) {
    const [row, col] = tilePosition(t.index);
    const cx = centre(col) * size,
      cy = centre(row) * size;
    // Direction to the centre decides which way the text faces.
    const dx = Math.sign(0.5 - centre(col)),
      dy = Math.sign(0.5 - centre(row));
    const angle = Math.atan2(dx, -dy);
    const corner = [0, 8, 16, 24].includes(t.index);
    const w = (corner ? 1.3 : 1) * (size / UNITS),
      h = 1.3 * (size / UNITS);
    c.save();
    c.translate(cx, cy);
    c.rotate(angle);
    // In the rotated frame every side tile is 1 unit along the edge and 1.3 units deep.
    drawTile(c, t, w, h);
    c.restore();
  }
  // Fine outer rule.
  c.strokeStyle = 'rgba(59,42,26,0.8)';
  c.lineWidth = 6;
  c.strokeRect(3, 3, size - 6, size - 6);
  return canvas;
}

let mapUrl: string | null = null;
/** The centre map as an image for the 2D board (cached). */
export function centerMapUrl() {
  if (mapUrl) return mapUrl;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 900;
  const c = canvas.getContext('2d');
  if (!c) return '';
  drawCenterMap(c, 0, 0, 900);
  mapUrl = canvas.toDataURL('image/jpeg', 0.86);
  return mapUrl;
}

/** Procedural wood grain for the table and the board frame. */
export function drawWood(size = 1024, tone: 'table' | 'frame' = 'table') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const random = seeded(tone === 'table' ? 5 : 9);
  const [a, b] = tone === 'table' ? ['#8a5a32', '#6e4424'] : ['#5c3a1d', '#3f2612'];
  const base = c.createLinearGradient(0, 0, size, 0);
  base.addColorStop(0, a);
  base.addColorStop(0.5, b);
  base.addColorStop(1, a);
  c.fillStyle = base;
  c.fillRect(0, 0, size, size);
  // Planks.
  const planks = tone === 'table' ? 5 : 1;
  for (let p = 0; p < planks; p++) {
    const y0 = (p / planks) * size;
    c.fillStyle = `rgba(0,0,0,${0.04 + random() * 0.08})`;
    c.fillRect(0, y0, size, size / planks);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, y0, size, 2);
  }
  // Grain lines.
  for (let i = 0; i < 260; i++) {
    const y = random() * size;
    c.strokeStyle = `rgba(${random() < 0.5 ? '40,20,5' : '255,220,170'},${0.04 + random() * 0.08})`;
    c.lineWidth = 0.6 + random() * 2.2;
    c.beginPath();
    const phase = random() * 10,
      amp = 2 + random() * 6;
    for (let x = 0; x <= size; x += 16) c.lineTo(x, y + Math.sin(x / 90 + phase) * amp);
    c.stroke();
  }
  // A few knots.
  for (let k = 0; k < (tone === 'table' ? 6 : 2); k++) {
    const kx = random() * size,
      ky = random() * size;
    for (let r = 18; r > 2; r -= 4) {
      c.strokeStyle = 'rgba(40,20,5,0.18)';
      c.beginPath();
      c.ellipse(kx, ky, r * 2.2, r, 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
  return canvas;
}

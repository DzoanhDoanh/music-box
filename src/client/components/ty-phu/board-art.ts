// Printed artwork for the Tỷ Phú board: the old-town map in the middle, drawn once on a canvas.

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

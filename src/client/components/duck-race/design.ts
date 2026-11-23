import type { DuckSkin, DuckTrack } from '../../../shared/duck-race/contracts';
export const skins: Record<
  DuckSkin,
  { name: string; color: string; accent: string; icon: string }
> = {
  YELLOW: { name: 'Vàng cổ điển', color: '#ffd445', accent: '#ff922e', icon: '🦆' },
  WHITE: { name: 'Mây trắng', color: '#fff4e7', accent: '#ffbd56', icon: '☁️' },
  BLACK: { name: 'Thiên nga đêm', color: '#383e59', accent: '#b0c5eb', icon: '🌙' },
  NINJA: { name: 'Ninja', color: '#454764', accent: '#f9687e', icon: '🥷' },
  PIRATE: { name: 'Thuyền trưởng', color: '#f6cc68', accent: '#d2445f', icon: '🏴‍☠️' },
  KING: { name: 'Hoàng gia', color: '#fce7ad', accent: '#b687f1', icon: '👑' },
  ASTRONAUT: { name: 'Phi hành gia', color: '#e3f2ff', accent: '#88b8ff', icon: '🚀' },
  COWBOY: { name: 'Cao bồi', color: '#dfb178', accent: '#ad6447', icon: '🤠' },
  CONICAL: { name: 'Nón lá Việt Nam', color: '#fff3bd', accent: '#63ba8d', icon: '🌾' },
  PARTY: { name: 'Sinh nhật', color: '#f89ed3', accent: '#9871ec', icon: '🎉' },
  ROBOT: { name: 'Robot', color: '#a3cbd3', accent: '#65f4e0', icon: '🤖' },
  RAINBOW: { name: 'Cầu vồng', color: '#bfa3f5', accent: '#7df0d0', icon: '🌈' },
};
export const maps: Record<
  DuckTrack,
  {
    name: string;
    subtitle: string;
    sky: string;
    water: string;
    deep: string;
    grass: string;
    leaf: string;
    light: string;
    icon: string;
  }
> = {
  SUNNY: {
    name: 'Sunny River',
    subtitle: 'Nắng ấm bên dòng sông',
    sky: '#b8e9f2',
    water: '#51d4d0',
    deep: '#1c86a3',
    grass: '#80bf62',
    leaf: '#378b5b',
    light: '#fff0ca',
    icon: '☀️',
  },
  TROPICAL: {
    name: 'Tropical River',
    subtitle: 'Phiêu lưu giữa rừng nhiệt đới',
    sky: '#afe8df',
    water: '#3ee0c2',
    deep: '#127e91',
    grass: '#5dba77',
    leaf: '#187b60',
    light: '#fff5d1',
    icon: '🌴',
  },
  FESTIVAL: {
    name: 'Night Festival',
    subtitle: 'Đêm hội của những vì sao',
    sky: '#192d51',
    water: '#426aca',
    deep: '#17456a',
    grass: '#416e82',
    leaf: '#356b81',
    light: '#d8e7ff',
    icon: '🏮',
  },
};
export type CameraMode =
  | 'AUTO'
  | 'OVERVIEW'
  | 'LEADER'
  | 'SIDE'
  | 'WATER'
  | 'AERIAL'
  | 'FINISH'
  | 'FREE';
export const cameras: Record<CameraMode, string> = {
  AUTO: 'Điện ảnh tự động',
  OVERVIEW: 'Toàn cảnh',
  LEADER: 'Nhóm dẫn đầu',
  SIDE: 'Ngang dòng sông',
  WATER: 'Sát mặt nước',
  AERIAL: 'Từ trên cao',
  FINISH: 'Vạch đích',
  FREE: 'Tự do',
};
export type Graphics = {
  quality: 'LOW' | 'MEDIUM' | 'HIGH';
  resolution: number;
  shadows: boolean;
  particles: boolean;
  reducedMotion: boolean;
  fps: boolean;
  autoQuality: boolean;
  volume: number;
  twoD: boolean;
};
export function readGraphics(): Graphics {
  const defaults: Graphics = {
    quality: 'MEDIUM',
    resolution: innerWidth < 760 ? 1 : 1.5,
    shadows: true,
    particles: true,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    fps: false,
    autoQuality: true,
    volume: 0,
    twoD: innerWidth < 760,
  };
  try {
    const saved = JSON.parse(localStorage.getItem('roomtune:duck:graphics:v1') ?? 'null');
    if (!saved) return defaults;
    for (const key of [
      'shadows',
      'particles',
      'reducedMotion',
      'fps',
      'twoD',
      'autoQuality',
    ] as const)
      if (typeof saved[key] === 'boolean') defaults[key] = saved[key];
    if (['LOW', 'MEDIUM', 'HIGH'].includes(saved.quality)) defaults.quality = saved.quality;
    if ([0.75, 1, 1.5, 2].includes(saved.resolution)) defaults.resolution = saved.resolution;
    if (typeof saved.volume === 'number') defaults.volume = Math.max(0, Math.min(1, saved.volume));
    return defaults;
  } catch {
    return defaults;
  }
}
export const riverX = (z: number) => Math.sin(z / 38) * 7 + Math.sin(z / 19) * 1.4;
export const raceZ = (position: number) => -90 + position * 180;
export const riverWidth = 34;

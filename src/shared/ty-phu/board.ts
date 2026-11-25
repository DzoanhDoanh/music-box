// Tỷ Phú Phố Nhạc board: 32 tiles = 4 corners + 4 legs × 7, travelling north → south.
// Tile 29 (Phú Quốc) was a beach before 2026-11-25; saved ownership carries over at land level.
// See docs/TY_PHU_GAME_DESIGN.md. Indices are stable and stored in saved games.

export type TileKind =
  | 'START'
  | 'JAIL'
  | 'FESTIVAL'
  | 'AIRPORT'
  | 'CITY'
  | 'BEACH'
  | 'CHANCE'
  | 'TAX';
export type Tile = {
  index: number;
  kind: TileKind;
  name: string;
  /** Leg 1–4 for non-corner tiles, 0 for corners. */
  side: 0 | 1 | 2 | 3 | 4;
  /** Listed land price G (cities and beaches). */
  price?: number;
  /** Adjacent colour group; cities without a group can never form a monopoly. */
  group?: number;
};

const city = (
  index: number,
  name: string,
  side: Tile['side'],
  price: number,
  group?: number,
): Tile => ({
  index,
  kind: 'CITY',
  name,
  side,
  price,
  ...(group === undefined ? {} : { group }),
});
const beach = (index: number, name: string, side: Tile['side']): Tile => ({
  index,
  kind: 'BEACH',
  name,
  side,
  price: BEACH_PRICE,
});
const special = (index: number, kind: TileKind, name: string, side: Tile['side']): Tile => ({
  index,
  kind,
  name,
  side,
});

export const BEACH_PRICE = 200;
/** Beach rent by how many beaches the owner holds (index = count). */
export const BEACH_RENTS = [0, 25, 50, 200, 200] as const;
export const SALARY = 200;
export const JAIL_FINE = 100;
export const FLY_FEE = 50;
/** Paid to the bank to host Đại nhạc hội from the festival corner. */
export const FESTIVAL_FEE = 50;
export const BIRTHDAY_GIFT = 50;
export const JAIL_INDEX = 8;
export const FESTIVAL_INDEX = 16;
export const AIRPORT_INDEX = 24;
export const BOARD_SIZE = 32;

export const board: readonly Tile[] = [
  special(0, 'START', 'Xuất phát', 0),
  city(1, 'Hà Giang', 1, 60, 1),
  city(2, 'Cao Bằng', 1, 60, 1),
  city(3, 'Lạng Sơn', 1, 70, 1),
  beach(4, 'Biển Trà Cổ', 1),
  city(5, 'Sa Pa', 1, 80, 2),
  city(6, 'Điện Biên', 1, 80, 2),
  city(7, 'Mộc Châu', 1, 100, 2),
  special(8, 'JAIL', 'Nhà tù', 0),
  city(9, 'Hải Phòng', 2, 120, 3),
  city(10, 'Hà Nội', 2, 140, 3),
  city(11, 'Ninh Bình', 2, 120, 3),
  special(12, 'CHANCE', 'Cơ hội', 2),
  beach(13, 'Biển Sầm Sơn', 2),
  city(14, 'Vinh', 2, 160, 4),
  city(15, 'Đồng Hới', 2, 160, 4),
  special(16, 'FESTIVAL', 'Đại nhạc hội', 0),
  city(17, 'Huế', 3, 180, 5),
  city(18, 'Đà Nẵng', 3, 200, 5),
  special(19, 'CHANCE', 'Cơ hội', 3),
  beach(20, 'Biển Quy Nhơn', 3),
  city(21, 'Nha Trang', 3, 200, 6),
  city(22, 'Đà Lạt', 3, 220, 6),
  city(23, 'Buôn Ma Thuột', 3, 220, 6),
  special(24, 'AIRPORT', 'Sân bay', 0),
  beach(25, 'Biển Mũi Né', 4),
  city(26, 'Vũng Tàu', 4, 260, 7),
  city(27, 'Cần Thơ', 4, 260, 7),
  special(28, 'CHANCE', 'Cơ hội', 4),
  city(29, 'Phú Quốc', 4, 300),
  special(30, 'TAX', 'Thuế nhà', 4),
  city(31, 'TP. Hồ Chí Minh', 4, 400),
];

export const tile = (index: number): Tile => {
  const found = board[index];
  if (!found) throw new RangeError('Unknown tile ' + index);
  return found;
};
export const isProperty = (t: Tile) => t.kind === 'CITY' || t.kind === 'BEACH';
export const cities = board.filter((t) => t.kind === 'CITY');
export const beaches = board.filter((t) => t.kind === 'BEACH');
export const groupTiles = (group: number) => cities.filter((t) => t.group === group);
export const groups = [...new Set(cities.flatMap((t) => (t.group === undefined ? [] : [t.group])))];
/** "1 dãy nhà": every city on a leg (beaches are not required). */
export const sideCities = (side: 1 | 2 | 3 | 4) => cities.filter((t) => t.side === side);

/** Building levels: 0 land, 1–3 houses, 4 hotel. */
export const HOTEL = 4;
export const levelNames = ['Đất', 'Cấp 1', 'Cấp 2', 'Cấp 3', 'Khách sạn'] as const;
/** Rent multiplier M per level. */
export const levelRent = [1, 4, 10, 25, 40] as const;
/** Total value V per level, as a multiple of the land price G. */
export const levelValue = [1, 1.5, 2, 2.5, 3.5] as const;
/** Cost to reach a level from the previous one, as a multiple of G. */
export const levelCost = [1, 0.5, 0.5, 0.5, 1] as const;

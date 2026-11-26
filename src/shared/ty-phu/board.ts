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
  /** Land price B: the Mốc level of a city, or a beach's price. */
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
export const BEACH_RENTS = [0, 50, 100, 200, 400] as const;
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
  city(1, 'Hà Giang', 1, 50, 1),
  city(2, 'Cao Bằng', 1, 55, 1),
  city(3, 'Lạng Sơn', 1, 60, 1),
  beach(4, 'Biển Trà Cổ', 1),
  city(5, 'Sa Pa', 1, 70, 2),
  city(6, 'Điện Biên', 1, 75, 2),
  city(7, 'Mộc Châu', 1, 85, 2),
  special(8, 'JAIL', 'Nhà tù', 0),
  city(9, 'Hải Phòng', 2, 100, 3),
  city(10, 'Hà Nội', 2, 105, 3),
  city(11, 'Ninh Bình', 2, 110, 3),
  special(12, 'CHANCE', 'Cơ hội', 2),
  beach(13, 'Biển Sầm Sơn', 2),
  city(14, 'Vinh', 2, 120, 4),
  city(15, 'Đồng Hới', 2, 125, 4),
  special(16, 'FESTIVAL', 'Đại nhạc hội', 0),
  city(17, 'Huế', 3, 140, 5),
  city(18, 'Đà Nẵng', 3, 145, 5),
  special(19, 'CHANCE', 'Cơ hội', 3),
  beach(20, 'Biển Quy Nhơn', 3),
  city(21, 'Nha Trang', 3, 160, 6),
  city(22, 'Đà Lạt', 3, 165, 6),
  city(23, 'Buôn Ma Thuột', 3, 170, 6),
  special(24, 'AIRPORT', 'Sân bay', 0),
  beach(25, 'Biển Mũi Né', 4),
  city(26, 'Vũng Tàu', 4, 185, 7),
  city(27, 'Cần Thơ', 4, 190, 7),
  special(28, 'CHANCE', 'Cơ hội', 4),
  city(29, 'Phú Quốc', 4, 210),
  special(30, 'TAX', 'Thuế nhà', 4),
  city(31, 'TP. Hồ Chí Minh', 4, 220),
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

/** Building levels: 0 Mốc (land), 1–3 houses, 4 hotel. */
export const HOTEL = 4;
export const levelNames = ['Mốc', 'Nhà 1', 'Nhà 2', 'Nhà 3', 'Khách sạn'] as const;
/** Total price per level in tenths of B: 1.0, 2.4, 3.4, 4.4, 6.9 (price table 2026-11-26). */
const TOTAL_TENTHS = [10, 24, 34, 44, 69] as const;
/** Rent per level in hundredths of B: 0.06, 0.6, 1.3, 2.1, 4.13. */
const RENT_HUNDREDTHS = [6, 60, 130, 210, 413] as const;
/**
 * What owning a city at `level` costs in total, counted from buying the Mốc: B × factor,
 * rounded to a multiple of 5. Upgrades cost the difference between two totals; the bank pays
 * the total back and a buyout costs twice the total. Integer maths keeps the halves exact.
 */
export const levelTotal = (index: number, level: number) =>
  Math.round(((tile(index).price ?? 0) * TOTAL_TENTHS[level]) / 50) * 5;
/** Table rent of a city at `level` (before monopoly and festival), rounded to a whole number. */
export const levelRent = (index: number, level: number) =>
  Math.round(((tile(index).price ?? 0) * RENT_HUNDREDTHS[level]) / 100);

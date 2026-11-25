import type { CSSProperties, ReactNode } from 'react';
import { board, HOTEL, levelNames, type Tile } from '../../../shared/ty-phu/board';
import type { TyPhuPublicState } from '../../../shared/ty-phu/contracts';

export const playerColors = ['#e24b4a', '#378add', '#639922', '#ba7517'];
export const colorNames = ['Đỏ', 'Xanh dương', 'Xanh lá', 'Vàng'];
const groupColors: Record<number, string> = {
  1: '#97c459',
  2: '#639922',
  3: '#5dcaa5',
  4: '#1d9e75',
  5: '#ed93b1',
  6: '#d4537e',
  7: '#ef9f27',
};
const cornerIcons: Record<string, string> = {
  START: '🏁',
  JAIL: '🔒',
  FESTIVAL: '🎤',
  AIRPORT: '✈️',
};

/** Grid row/column (1-based) of a tile on the 9×9 board; Start sits bottom-right. */
export function tilePosition(i: number): [number, number] {
  if (i === 0) return [9, 9];
  if (i < 8) return [9, 9 - i];
  if (i === 8) return [9, 1];
  if (i < 16) return [9 - (i - 8), 1];
  if (i === 16) return [1, 1];
  if (i < 24) return [1, 1 + (i - 16)];
  if (i === 24) return [1, 9];
  return [1 + (i - 24), 9];
}
export function stripColor(t: Tile) {
  if (t.kind === 'BEACH') return '#85b7eb';
  if (t.kind === 'CITY') return t.group ? groupColors[t.group] : '#e24b4a';
  if (t.kind === 'TAX') return '#5f5e5a';
  return 'var(--line)';
}
export const shortName = (t: Tile) =>
  t.name.replace('Biển ', '').replace('Buôn Ma Thuột', 'BMT').replace('TP. Hồ Chí Minh', 'TP.HCM');

export default function TyPhuBoard({
  state,
  me,
  selectable,
  onTile,
  tilted,
  center,
}: {
  state: TyPhuPublicState;
  me: string;
  selectable: number[];
  onTile: (index: number) => void;
  tilted: boolean;
  center: ReactNode;
}) {
  const colorOf = (id: string) => playerColors[state.players.find((p) => p.id === id)?.color ?? 0];
  return (
    <div className={'typhu-board-wrap' + (tilted ? ' tilted' : '')}>
      <div className="typhu-board" role="group" aria-label="Bàn cờ Tỷ Phú Phố Nhạc">
        {board.map((t) => {
          const [row, col] = tilePosition(t.index);
          const owned = state.tiles[t.index];
          const here = state.players.filter((p) => p.status === 'ACTIVE' && p.position === t.index);
          const pick = selectable.includes(t.index);
          const style = {
            gridRow: row,
            gridColumn: col,
            '--owner': owned ? colorOf(owned.owner) : 'transparent',
          } as CSSProperties;
          const label =
            t.name +
            (owned
              ? ` · ${state.players.find((p) => p.id === owned.owner)?.name ?? ''} · ${levelNames[owned.level]}`
              : t.price
                ? ` · giá ${t.price}`
                : '');
          return (
            <button
              key={t.index}
              type="button"
              className={
                'typhu-tile kind-' +
                t.kind.toLowerCase() +
                (owned ? ' owned' : '') +
                (pick ? ' selectable' : '') +
                (owned?.owner === me ? ' mine' : '') +
                ([0, 8, 16, 24].includes(t.index) ? ' corner' : '')
              }
              style={style}
              aria-label={label + (pick ? ' · có thể chọn' : '')}
              onClick={() => onTile(t.index)}
            >
              {cornerIcons[t.kind] ? (
                <>
                  <span className="typhu-corner-icon" aria-hidden="true">
                    {cornerIcons[t.kind]}
                  </span>
                  <span className="typhu-tile-name">{t.name}</span>
                </>
              ) : (
                <>
                  <i className="typhu-strip" style={{ background: stripColor(t) }} />
                  <span className="typhu-tile-name">
                    {t.kind === 'CHANCE'
                      ? '🃏 Cơ hội'
                      : t.kind === 'TAX'
                        ? '🧾 Thuế'
                        : shortName(t)}
                  </span>
                  {owned ? (
                    <span className="typhu-levels" aria-hidden="true">
                      {owned.level === HOTEL
                        ? '🏨'
                        : Array.from({ length: owned.level }, (_, i) => <b key={i} />)}
                    </span>
                  ) : t.price ? (
                    <span className="typhu-price">{t.price}</span>
                  ) : null}
                </>
              )}
              {state.festival === t.index && (
                <span className="typhu-festival" title="Đang tổ chức Đại nhạc hội">
                  🎤
                </span>
              )}
              {owned && owned.blackout > 0 && (
                <span className="typhu-blackout" title="Đang mất điện">
                  ⚡
                </span>
              )}
              {here.length > 0 && (
                <span className="typhu-tokens">
                  {here.map((p) => (
                    <i
                      key={p.id}
                      className={p.id === state.turn ? 'active' : ''}
                      style={{ background: playerColors[p.color] }}
                      title={p.name}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
        {tilted ? (
          <div className="typhu-center-floor" />
        ) : (
          <div className="typhu-center">{center}</div>
        )}
      </div>
      {/* On the tilted board the controls stay upright, floating above the board's centre. */}
      {tilted && <div className="typhu-center typhu-center-upright">{center}</div>}
    </div>
  );
}

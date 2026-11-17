import { pieceSkinSchema, type PieceSkin } from '../../shared/game/piece-skins';
const key = (actor: string) => 'roomtune:ludo:skin:' + actor;
export function readPieceSkin(actor: string): PieceSkin {
  try {
    return pieceSkinSchema.catch('HORSE').parse(localStorage.getItem(key(actor)));
  } catch {
    return 'HORSE';
  }
}
export function rememberPieceSkin(actor: string, skin: PieceSkin) {
  try {
    localStorage.setItem(key(actor), skin);
    return true;
  } catch {
    return false;
  }
}

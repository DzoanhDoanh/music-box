// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPieceSkin, rememberPieceSkin } from '../../src/client/lib/piece-skin';
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
describe('device skin preference scoped to the signed-in player', () => {
  it('remembers a validated choice only for that player and falls back safely on old/corrupt storage', () => {
    expect(readPieceSkin('a')).toBe('HORSE');
    expect(rememberPieceSkin('a', 'CAT')).toBe(true);
    expect(readPieceSkin('a')).toBe('CAT');
    expect(readPieceSkin('b')).toBe('HORSE');
    localStorage.setItem('roomtune:ludo:skin:a', '<img src=x>');
    expect(readPieceSkin('a')).toBe('HORSE');
  });
  it('does not crash when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPieceSkin('a')).toBe('HORSE');
    expect(rememberPieceSkin('a', 'CAT')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  parseYouTubeUrl,
  durationSeconds,
  formatTime,
  orderQueue,
  AppError,
} from '../../src/shared/domain';
import {
  commandSchema,
  defaultSettings,
  joinSchema,
  settingsSchema,
  type QueueEntry,
} from '../../src/shared/contracts';
describe('YouTube URL validation', () => {
  it('extracts only the video from the reported radio URL, including a leading hyphen', () => {
    const id = parseYouTubeUrl(
      'https://www.youtube.com/watch?v=-q_S27LbNKU&list=RD-q_S27LbNKU&start_radio=1',
    );
    expect(id).toBe('-q_S27LbNKU');
    expect(commandSchema.parse({ action: 'enqueue', video_id: id })).toEqual({
      action: 'enqueue',
      video_id: '-q_S27LbNKU',
    });
  });
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=2',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
  ])('accepts official URL %s', (url) => expect(parseYouTubeUrl(url)).toBe('dQw4w9WgXcQ'));
  it.each([
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://youtube.com@evil.test/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'file:///watch?v=dQw4w9WgXcQ',
    'https://youtu.be/invalid',
    'https://youtube.com:9999/watch?v=dQw4w9WgXcQ',
    'https://evil.test/dQw4w9WgXcQ',
    'https://youtube.com/embed/dQw4w9WgXcQ',
    'https://a:password@youtube.com/watch?v=dQw4w9WgXcQ',
  ])('rejects unsafe URL %s', (url) => expect(parseYouTubeUrl(url)).toBeNull());
  it('parses durations', () => {
    expect(durationSeconds('PT1H2M3S')).toBe(3723);
    expect(durationSeconds('P1DT1H')).toBe(90000);
    expect(durationSeconds('LIVE')).toBe(0);
    expect(formatTime(-1)).toBe('0:00');
  });
});
const entry = (
  id: string,
  position: number,
  vote_count: number,
  requested_by: string,
  status = 'QUEUED',
) => ({ id, position, vote_count, requested_by, status }) as QueueEntry;
describe('queue ordering', () => {
  const queue = [
    entry('b', 2, 4, 'u1'),
    entry('a', 1, 4, 'u1'),
    entry('c', 3, 7, 'u2'),
    entry('d', 4, 1, 'u3'),
    entry('playing', 0, 99, 'u4', 'PLAYING'),
  ];
  it('uses stable FIFO and manual positions without mutating source', () => {
    expect(orderQueue(queue, 'FIFO').map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(orderQueue(queue, 'MANUAL').map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(queue[0].id).toBe('b');
  });
  it('sorts votes with deterministic tie break; excludes playing', () =>
    expect(orderQueue(queue, 'VOTING').map((e) => e.id)).toEqual(['c', 'a', 'b', 'd']));
  it('rotates users fairly', () =>
    expect(orderQueue(queue, 'FAIR').map((e) => e.id)).toEqual(['a', 'c', 'd', 'b']));
  it.each(['FIFO', 'VOTING', 'FAIR', 'MANUAL'] as const)(
    'reward priority leads %s while preserving the full queued set',
    (mode) => {
      const awarded = queue.map((item) => (item.id === 'd' ? { ...item, priority: 1 } : item));
      const result = orderQueue(awarded, mode);
      expect(result[0].id).toBe('d');
      expect(result.map((item) => item.id).sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(queue.every((item) => !item.priority)).toBe(true);
    },
  );
});
describe('contracts', () => {
  it('requires playback fencing and run ID', () =>
    expect(commandSchema.safeParse({ action: 'next' }).success).toBe(false));
  it('requires boolean vote intent, never client count', () =>
    expect(
      commandSchema.safeParse({ action: 'vote', entry_id: crypto.randomUUID(), vote_count: 100 })
        .success,
    ).toBe(false));
  it('validates limits', () => {
    expect(settingsSchema.safeParse({ ...defaultSettings, capacity: 100000 }).success).toBe(false);
    expect(settingsSchema.safeParse(defaultSettings).success).toBe(true);
  });
  it('normalizes join codes', () =>
    expect(joinSchema.parse({ code: ' abc123 ', name: 'Tên tôi' }).code).toBe('ABC123'));
  it('uses safe Vietnamese error fallback', () => {
    expect(new AppError('UNAUTHORIZED').message).toContain('Phiên');
    expect(new AppError('SQL internal secret').message).not.toContain('secret');
  });
});

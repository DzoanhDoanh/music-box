import { describe, expect, it } from 'vitest';
import { floatingChatPosition } from '../../src/client/lib/floating-chat-position';
import { notificationPosition } from '../../src/client/lib/notification-position';

describe('floating overlay placement', () => {
  it.each([320, 390, 768, 1440, 1920])('separates video, vote and chat at width %i', (width) => {
    for (const height of [480, 844, 1080])
      for (const top of [-100, 80, 250, 590]) {
        const player = { left: 16, right: Math.min(width - 16, 400), top, bottom: top + 200 };
        const vote = notificationPosition(width, height, 340, [player], {
          cardWidth: 360,
          edge: 'top',
        })!;
        expect(vote).toBeTruthy();
        const obstacles = [
          player,
          {
            left: vote.left,
            right: vote.left + vote.width,
            top: vote.top,
            bottom: vote.top + Math.min(340, vote.maxHeight),
          },
        ];
        const chat = floatingChatPosition(width, height, true, obstacles);
        if (chat) {
          expect(chat.left).toBeGreaterThanOrEqual(0);
          expect(chat.left + chat.width).toBeLessThanOrEqual(width);
          expect(chat.top + chat.height).toBeLessThanOrEqual(height);
          for (const r of obstacles)
            expect(
              chat.left >= r.right ||
                chat.left + chat.width <= r.left ||
                chat.top >= r.bottom ||
                chat.top + chat.height <= r.top,
            ).toBe(true);
        }
      }
  });
  it('prefers top right for a vote and bottom right for chat without obstacles', () => {
    expect(notificationPosition(1440, 900, 340, [], { edge: 'top' })?.top).toBe(12);
    const chat = floatingChatPosition(1440, 900, true, [])!;
    expect(chat.top + chat.height).toBe(888);
    expect(chat.left + chat.width).toBe(1428);
  });
});

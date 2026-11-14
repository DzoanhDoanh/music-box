// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { withFeedback, commandFeedback } from '../../src/client/lib/feedback';
import { AsyncButton, Button, Confirm } from '../../src/client/components/ui';
import { notificationPosition } from '../../src/client/lib/notification-position';

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('feedback for slow and failed actions', () => {
  it('replaces one slow-action notice with its outcome and clears its timer', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const result = withFeedback(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      'Đang thêm…',
      'Đã thêm.',
    );
    expect(toast.loading).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(toast.loading).toHaveBeenCalledTimes(1);
    finish();
    await result;
    const id = vi.mocked(toast.loading).mock.calls[0][1]!.id;
    expect(toast.success).toHaveBeenCalledWith('Đã thêm.', { id });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reports a fast failure exactly once with no delayed loading notice', async () => {
    vi.useFakeTimers();
    await expect(
      withFeedback(
        async () => {
          throw new Error('Mất kết nối');
        },
        'Đang lưu…',
        'Đã lưu',
      ),
    ).rejects.toThrow('Mất kết nối');
    await vi.advanceTimersByTimeAsync(1000);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.loading).not.toHaveBeenCalled();
    expect(
      commandFeedback(
        { action: 'heartbeat', controller_id: 'test', fence: 1, position: 0, run_id: null },
        false,
      ),
    ).toBeNull();
  });
  it('blocks duplicate clicks while pending and recovers on failure', async () => {
    let fail!: (e: Error) => void;
    const action = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    render(
      <AsyncButton onClick={action} loadingLabel="Đang thêm…">
        Thêm bài
      </AsyncButton>,
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(true);
    await act(async () => fail(new Error('Failed')));
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.textContent).toBe('Thêm bài');
  });
  it('keeps a confirmation open on failure and allows retry', async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValueOnce(undefined);
    render(
      <Confirm title="Dọn hàng chờ?" onConfirm={action}>
        <Button>Dọn</Button>
      </Confirm>,
    );
    fireEvent.click(screen.getByText('Dọn'));
    await act(async () => fireEvent.click(screen.getByText('Xác nhận')));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByText('Xác nhận')));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(action).toHaveBeenCalledTimes(2);
  });
});

describe('notification placement outside visible players', () => {
  it.each([320, 390, 768, 1366, 1920])(
    'keeps a readable toast in the %ipx viewport while scrolling',
    (width) => {
      for (const top of [-100, 0, 250, 570, 750]) {
        const player = { left: 16, right: Math.min(width - 16, 630), top, bottom: top + 200 };
        const slot = notificationPosition(width, 844, 90, [player]);
        expect(slot).not.toBeNull();
        const s = slot!;
        expect(s.left).toBeGreaterThanOrEqual(0);
        expect(s.left + s.width).toBeLessThanOrEqual(width);
        expect(s.top + Math.min(90, s.maxHeight)).toBeLessThanOrEqual(844);
        expect(
          s.left >= player.right ||
            s.left + s.width <= player.left ||
            s.top >= player.bottom ||
            s.top + Math.min(90, s.maxHeight) <= player.top,
        ).toBe(true);
      }
    },
  );
});

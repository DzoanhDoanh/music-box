// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReorderProposalDialog, ReorderVotePanel } from '../../src/client/components/ReorderVoting';
import { defaultSettings, type QueueEntry, type Snapshot } from '../../src/shared/contracts';

const ordered = ['a', 'b', 'c'].map((id) => ({ id, song: { title: id } })) as QueueEntry[];
const fixture = (): Snapshot =>
  ({
    me: 'me',
    role: 'member',
    settings: { ...defaultSettings, reorder_approval: true, queue_mode: 'MANUAL' },
    reorder: {
      online_count: 4,
      proposal: {
        id: 'proposal',
        entry_id: 'c',
        title: 'Bài C',
        requested_by: 'other',
        requester: 'Bạn khác',
        from_position: 3,
        target_position: 1,
        electorate_count: 4,
        required_votes: 3,
        yes_votes: 1,
        no_votes: 0,
        my_vote: null,
        eligible: true,
        expires_at: new Date(Date.now() + 120000).toISOString(),
        status: 'OPEN',
      },
    },
  }) as Snapshot;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('queue move approval controls', () => {
  it('floats without stealing focus, stays minimized on updates and opens a new proposal', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const state = fixture();
    const execute = vi.fn();
    const view = render(<ReorderVotePanel snapshot={state} execute={execute} />);
    expect(document.activeElement).toBe(input);
    expect(view.container.querySelector('.floating-vote')).toBeNull();
    expect(document.body.querySelector('.floating-vote')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thu nhỏ biểu quyết' }));
    state.reorder!.proposal!.yes_votes = 2;
    view.rerender(<ReorderVotePanel snapshot={state} execute={execute} />);
    expect(screen.getByRole('button', { name: /Biểu quyết đang chờ/ }).textContent).toContain(
      '2/3',
    );
    expect(screen.queryByRole('button', { name: 'Đồng ý' })).toBeNull();
    state.reorder!.proposal!.id = 'next';
    view.rerender(<ReorderVotePanel snapshot={state} execute={execute} />);
    expect(screen.getByRole('button', { name: 'Đồng ý' })).toBeTruthy();
    state.settings.reorder_approval = false;
    view.rerender(<ReorderVotePanel snapshot={state} execute={execute} />);
    expect(document.body.querySelector('.floating-vote')).toBeNull();
    input.remove();
  });
  it('keeps the result until dismissed and clears dismissal for the next proposal', () => {
    const state = fixture();
    state.reorder!.proposal!.status = 'APPLIED';
    const execute = vi.fn();
    const view = render(<ReorderVotePanel snapshot={state} execute={execute} />);
    fireEvent.click(screen.getByRole('button', { name: 'Đóng biểu quyết' }));
    expect(screen.queryByRole('region')).toBeNull();
    state.reorder!.proposal!.id = 'next';
    state.reorder!.proposal!.status = 'OPEN';
    view.rerender(<ReorderVotePanel snapshot={state} execute={execute} />);
    expect(screen.getByRole('button', { name: 'Đồng ý' })).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
  });
  it('starts a fresh countdown when the first proposal appears after a long idle period', async () => {
    vi.useFakeTimers();
    const state = fixture();
    state.reorder!.proposal = null;
    const execute = vi.fn();
    const view = render(<ReorderVotePanel snapshot={state} execute={execute} />);
    await act(async () => vi.advanceTimersByTimeAsync(600000));
    view.rerender(<ReorderVotePanel snapshot={fixture()} execute={execute} />);
    expect(screen.getByText(/Còn 2:00/)).toBeTruthy();
  });
  it('keeps the chosen exact position and blocks duplicate submission while waiting', async () => {
    let resolve!: () => void;
    const execute = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const onClose = vi.fn();
    render(
      <ReorderProposalDialog
        entry={ordered[2]}
        ordered={ordered}
        execute={execute}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đang gửi…' }));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      action: 'reorder.propose',
      entry_id: 'c',
      position: 2,
      queue_ids: ['a', 'b', 'c'],
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('requires reopening after the queue changes instead of reinterpreting a chosen position', () => {
    const execute = vi.fn();
    const props = { entry: ordered[2], execute, onClose: vi.fn() };
    const view = render(<ReorderProposalDialog {...props} ordered={ordered} />);
    view.rerender(
      <ReorderProposalDialog {...props} ordered={[ordered[1], ordered[0], ordered[2]]} />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Hàng chờ đã thay đổi');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));
    expect(execute).not.toHaveBeenCalled();
  });
  it('handles pending votes and permits retry after failure without hiding the proposal', async () => {
    let fail!: (error: Error) => void;
    const execute = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    render(<ReorderVotePanel snapshot={fixture()} execute={execute} />);
    fireEvent.click(screen.getByRole('button', { name: 'Không đồng ý' }));
    expect(screen.getByRole('button', { name: 'Đồng ý' }).hasAttribute('disabled')).toBe(true);
    expect(execute).toHaveBeenCalledWith({
      action: 'reorder.vote',
      proposal_id: 'proposal',
      approved: false,
    });
    await act(async () => fail(new Error('offline')));
    expect(screen.getByRole('button', { name: 'Đồng ý' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByText(/1\/3 phiếu/, { selector: 'strong' })).toBeTruthy();
  });
  it('uses server clock offset for expiry and hides controls for late arrivals', async () => {
    vi.useFakeTimers();
    const state = fixture();
    state.clock_offset_ms = 119000;
    state.reorder!.proposal!.eligible = false;
    render(<ReorderVotePanel snapshot={state} execute={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Đồng ý' })).toBeNull();
    expect(screen.getByText(/Bạn vào sau/)).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole('status').textContent).toBe('Đã hết thời gian biểu quyết');
  });
});

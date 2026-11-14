// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPanel from '../../src/client/components/ChatPanel';
import { readChatMarker } from '../../src/client/lib/chat';
import type { ChatMessage, ChatSnapshot } from '../../src/shared/contracts';
import { AppError } from '../../src/shared/domain';
import { useState } from 'react';
const request = vi.hoisted(() => vi.fn());
vi.mock('../../src/client/lib/api', () => ({ api: request }));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));
const marker = 'roomtune:chat-read:me:room';
let state: ChatSnapshot;
let client: QueryClient;
const message = (sequence: number, sender = 'other', body = 'Xin chào'): ChatMessage => ({
  id: `id-${sequence}`,
  sequence,
  sender_id: sender,
  sender,
  body,
  deleted: false,
  created_at: new Date().toISOString(),
});
function Harness({ actor, manager = false }: { actor: string; manager?: boolean }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  return (
    <>
      <button onClick={() => setOpen(!open)}>Trò chuyện</button>
      {unread > 0 && <span aria-label={`${unread} tin chưa đọc`}>{unread}</span>}
      {open && <button onClick={() => setOpen(false)}>Đóng trò chuyện</button>}
      <ChatPanel
        roomId="room"
        actor={actor}
        manager={manager}
        open={open}
        onUnreadChange={setUnread}
      />
    </>
  );
}
function mount(actor = 'me', manager = false) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Harness key={actor} actor={actor} manager={manager} />
    </QueryClientProvider>,
  );
}
const open = () => fireEvent.click(screen.getByRole('button', { name: /Trò chuyện/ }));
const incoming = async (item: ChatMessage) => {
  state = { ...state, latest_sequence: item.sequence, messages: [...state.messages, item] };
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['chat'] });
  });
};
beforeEach(() => {
  localStorage.clear();
  state = { messages: [message(1)], latest_sequence: 1, read_sequence: 0, unread_count: 1 };
  request
    .mockReset()
    .mockImplementation(async (path: string, body?: { action: string; body: string }) => {
      if (body) {
        state = {
          ...state,
          latest_sequence: state.latest_sequence + 1,
          messages: [...state.messages, message(state.latest_sequence + 1, 'me', body.body)],
        };
        return {};
      }
      const since = Number(new URL(path, 'http://fixture').searchParams.get('since'));
      return {
        ...state,
        read_sequence: since,
        unread_count: state.messages.filter(
          (m) => m.sequence > since && m.sender_id !== 'me' && !m.deleted,
        ).length,
      };
    });
});
afterEach(() => {
  cleanup();
  client?.clear();
  vi.restoreAllMocks();
});
describe('room chat experience', () => {
  it('does not announce old history on first visit and stores only a numeric marker', async () => {
    mount();
    await waitFor(() => expect(localStorage.getItem(marker)).toBe('1'));
    expect(screen.queryByLabelText(/tin chưa đọc/)).toBeNull();
    await incoming(message(2));
    expect(await screen.findByLabelText('1 tin chưa đọc')).toBeTruthy();
    expect(localStorage.getItem(marker)).toBe('1');
    open();
    await waitFor(() => expect(localStorage.getItem(marker)).toBe('2'));
    expect(screen.queryByLabelText(/tin chưa đọc/)).toBeNull();
    expect(localStorage.getItem(marker)).not.toContain('Xin chào');
  });
  it('renders text safely and exposes delete only for the sender or manager', async () => {
    state.messages = [
      message(1, 'other', '<img src=x onerror=alert(1)>'),
      message(2, 'me', 'Tin của tôi'),
    ];
    state.latest_sequence = 2;
    mount();
    open();
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('.chat-message img')).toBeNull();
    expect(screen.getAllByRole('button', { name: /Xóa tin nhắn/ })).toHaveLength(1);
  });
  it('retains draft on close and reuses the same receipt after an ambiguous failure', async () => {
    mount();
    open();
    await screen.findByText('Xin chào');
    fireEvent.change(screen.getByLabelText('Tin nhắn của bạn'), {
      target: { value: 'Tin đang soạn' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đóng trò chuyện' }));
    open();
    expect((screen.getByLabelText('Tin nhắn của bạn') as HTMLTextAreaElement).value).toBe(
      'Tin đang soạn',
    );
    request.mockRejectedValueOnce(new AppError('BACKEND_UNAVAILABLE', 503));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin' }));
    await screen.findByRole('button', { name: 'Gửi lại' });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));
    await screen.findByText('Tin đang soạn');
    const sent = request.mock.calls.filter((c) => c[1]?.action === 'send');
    expect(sent).toHaveLength(2);
    expect(sent[0][2]).toBe(sent[1][2]);
    expect(sent[0][3]).toBe('me');
    expect((screen.getByLabelText('Tin nhắn của bạn') as HTMLTextAreaElement).value).toBe('');
  });
  it('prevents double send while the network request is pending', async () => {
    mount();
    open();
    await screen.findByText('Xin chào');
    let complete!: () => void;
    request.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    fireEvent.change(screen.getByLabelText('Tin nhắn của bạn'), { target: { value: 'one' } });
    fireEvent.submit(document.querySelector('.chat-compose')!);
    fireEvent.submit(document.querySelector('.chat-compose')!);
    expect(request.mock.calls.filter((c) => c[1])).toHaveLength(1);
    expect((screen.getByLabelText('Tin nhắn của bạn') as HTMLTextAreaElement).disabled).toBe(true);
    await act(async () => complete());
  });
  it('does not mark incoming messages read while scrolled up or the page is hidden', async () => {
    mount();
    open();
    await screen.findByText('Xin chào');
    const region = screen.getByRole('region', { name: 'Tin nhắn trong phòng' });
    Object.defineProperties(region, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 300 },
    });
    region.scrollTop = 0;
    fireEvent.scroll(region);
    await incoming(message(2));
    expect(localStorage.getItem(marker)).toBe('1');
    expect(await screen.findByRole('button', { name: '1 tin mới' })).toBeTruthy();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    fireEvent.click(screen.getByRole('button', { name: '1 tin mới' }));
    expect(localStorage.getItem(marker)).toBe('1');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(localStorage.getItem(marker)).toBe('2'));
  });
  it('hides cached messages on access denial and resets drafts on identity change', async () => {
    const view = mount();
    open();
    await screen.findByText('Xin chào');
    fireEvent.change(screen.getByLabelText('Tin nhắn của bạn'), {
      target: { value: 'private draft' },
    });
    request.mockRejectedValue(new AppError('PERMISSION_DENIED', 403));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['chat'] });
    });
    await waitFor(() => expect(screen.queryByText('Xin chào')).toBeNull());
    expect(screen.queryByLabelText('Tin nhắn của bạn')).toBeNull();
    request.mockResolvedValue({ ...state, messages: [] });
    view.rerender(
      <QueryClientProvider client={client}>
        <Harness key="other" actor="other" />
      </QueryClientProvider>,
    );
    open();
    await screen.findByText('Mở lời với cả phòng');
    expect((screen.getByLabelText('Tin nhắn của bạn') as HTMLTextAreaElement).value).toBe('');
  });
  it('rejects malformed stored cursors', () => {
    for (const value of ['NaN', '-1', '0.2', '9007199254740992']) {
      localStorage.setItem(marker, value);
      expect(readChatMarker(marker)).toBeNull();
    }
  });
  it('shows only acknowledged sends, unlocks before a slow read, and reconciles without duplicates', async () => {
    mount();
    open();
    await screen.findByText('Xin chào');
    let acknowledge!: (value: { id: string; sequence: number }) => void;
    request.mockImplementation((_path: string, body?: unknown) =>
      body
        ? new Promise((resolve) => {
            acknowledge = resolve;
          })
        : new Promise(() => {}),
    );
    fireEvent.change(screen.getByLabelText('Tin nhắn của bạn'), { target: { value: 'Gửi nhanh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin' }));
    expect(screen.queryByText('Gửi nhanh', { selector: '.chat-message p' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đang gửi…' })).toHaveProperty('disabled', true);
    await act(async () => acknowledge({ id: 'id-2', sequence: 2 }));
    expect(await screen.findByText('Gửi nhanh')).toBeTruthy();
    expect(screen.getByLabelText('Tin nhắn của bạn')).toHaveProperty('disabled', false);
    await act(async () =>
      client.setQueryData(['chat', 'room', 'me'], {
        ...state,
        latest_sequence: 2,
        messages: [...state.messages, message(2, 'me', 'Gửi nhanh')],
      }),
    );
    expect(screen.getAllByText('Gửi nhanh')).toHaveLength(1);
  });
  it('can remove a newly acknowledged message before the background read completes', async () => {
    mount();
    open();
    await screen.findByText('Xin chào');
    let removed = false;
    request.mockImplementation(async (_path: string, body?: { action: string }) => {
      if (body?.action === 'send') return { id: 'id-2', sequence: 2 };
      if (body?.action === 'remove') {
        removed = true;
        return { id: 'id-2', sequence: 2 };
      }
      if (!removed) return new Promise(() => {});
      return {
        ...state,
        latest_sequence: 2,
        messages: [...state.messages, { ...message(2, 'me'), body: '', deleted: true }],
      };
    });
    fireEvent.change(screen.getByLabelText('Tin nhắn của bạn'), { target: { value: 'Tin tạm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin' }));
    await screen.findByText('Tin tạm');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tin nhắn của bạn' }));
    await screen.findByText('Tin nhắn đã được xóa');
    expect(screen.queryByText('Tin tạm')).toBeNull();
  });
  it('hides acknowledged messages on access denial even when the next read fails', async () => {
    mount();
    open();
    await screen.findByText('Xin chào');
    request.mockImplementation(async (_path: string, body?: unknown) => {
      if (body) return { id: 'id-2', sequence: 2 };
      throw new AppError('PERMISSION_DENIED', 403);
    });
    fireEvent.change(screen.getByLabelText('Tin nhắn của bạn'), { target: { value: 'Tin riêng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin' }));
    await waitFor(() => expect(screen.queryByLabelText('Tin nhắn của bạn')).toBeNull());
    expect(screen.queryByText('Tin riêng')).toBeNull();
    expect(screen.queryByText('Xin chào')).toBeNull();
  });
});

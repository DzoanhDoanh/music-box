// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import RoomMembers from '../../src/client/components/RoomMembers';
import type { Member } from '../../src/shared/contracts';

const members: Member[] = [
  { user_id: 'owner', name: 'Đoàn Anh', role: 'owner', joined_at: '' },
  { user_id: 'me', name: 'Bạn nghe', role: 'member', joined_at: '' },
  { user_id: 'other', name: 'Minh', role: 'moderator', joined_at: '' },
];
afterEach(cleanup);

it('counts only known members, searches Vietnamese names, filters and updates an open list', () => {
  const props = { members, me: 'me', onlineMembers: ['me', 'me', 'other', 'outsider'] };
  const view = render(<RoomMembers {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Xem thành viên: 2 đang online' }));
  const list = screen.getByRole('list', { name: 'Danh sách thành viên' });
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((item) => item.getAttribute('data-member-id')),
  ).toEqual(['me', 'other', 'owner']);
  expect(within(list).getByText('Bạn')).toBeTruthy();
  expect(within(list).getByText('Chủ phòng')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm thành viên' }), {
    target: { value: 'doan' },
  });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).getByText('Đoàn Anh')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /^Offline/ }));
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  view.rerender(<RoomMembers {...props} onlineMembers={['me', 'owner', 'other']} />);
  expect(within(list).getByText('Mọi người đều đang online.')).toBeTruthy();
  view.rerender(<RoomMembers {...props} members={members.slice(0, 2)} onlineMembers={['me']} />);
  expect(within(list).getByText('Đoàn Anh')).toBeTruthy();
  expect(screen.queryByText('Minh')).toBeNull();
});

it('shows unknown while reconnecting instead of false offline and restores live filtering', () => {
  const view = render(<RoomMembers members={members} me="me" onlineMembers={['me']} />);
  fireEvent.click(screen.getByRole('button', { name: 'Xem thành viên: 1 đang online' }));
  fireEvent.click(screen.getByRole('button', { name: /^Offline/ }));
  view.rerender(<RoomMembers members={members} me="me" onlineMembers={null} />);
  expect(screen.getByText('Đang cập nhật trạng thái kết nối…')).toBeTruthy();
  expect((screen.getByRole('button', { name: /^Offline/ }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  const list = screen.getByRole('list');
  expect(within(list).getAllByText('Đang cập nhật')).toHaveLength(3);
  expect(within(list).queryByText('Offline')).toBeNull();
  view.rerender(<RoomMembers members={members} me="me" onlineMembers={['me', 'owner']} />);
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).getByText('Minh')).toBeTruthy();
});

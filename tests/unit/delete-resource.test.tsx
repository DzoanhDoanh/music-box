// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeleteResource from '../../src/client/components/DeleteResource';
import { AppError } from '../../src/shared/domain';

const request = vi.hoisted(() => vi.fn());
vi.mock('../../src/client/lib/api', () => ({ api: request }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const actor = '10000000-0000-4000-8000-000000000001';
const path = '/rooms/20000000-0000-4000-8000-000000000001/delete';
const scope = `roomtune:delete:${actor}:${path}`;
const deleted = vi.fn();
const renderDelete = () =>
  render(
    <DeleteResource
      actor={actor}
      path={path}
      name="Nhạc của bạn"
      label="Xóa phòng"
      description="Xóa vĩnh viễn phòng và lịch sử."
      onDeleted={deleted}
    />,
  );
function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Xóa phòng' }));
  expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nhạc của bạn' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
}
beforeEach(() => {
  sessionStorage.clear();
  request.mockReset();
  deleted.mockReset();
});
afterEach(cleanup);
describe('confirmed deletion recovery', () => {
  it('persists the exact request before sending and reuses it after unmount on a lost response', async () => {
    request.mockRejectedValue(new AppError('BACKEND_UNAVAILABLE', 503));
    const first = renderDelete();
    confirm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled());
    const saved = JSON.parse(sessionStorage.getItem(scope)!);
    expect(request).toHaveBeenCalledWith(path, { name: 'Nhạc của bạn' }, saved.key, actor);
    expect(deleted).not.toHaveBeenCalled();
    first.unmount();
    request.mockResolvedValue({ deleted: true });
    renderDelete();
    confirm();
    await waitFor(() => expect(deleted).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[1]).toEqual(request.mock.calls[0]);
    expect(sessionStorage.getItem(scope)).toBeNull();
  });
  it('does not report success on denied access and clears the rejected pending request', async () => {
    request.mockRejectedValue(new AppError('PERMISSION_DENIED', 403));
    renderDelete();
    confirm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled());
    expect(deleted).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(scope)).toBeNull();
  });
  it('recovers corrupt metadata with a new confirmed request', async () => {
    sessionStorage.setItem(scope, '{broken');
    request.mockResolvedValue({ deleted: true });
    renderDelete();
    confirm();
    await waitFor(() => expect(deleted).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(scope)).toBeNull();
  });
  it('does not mistake a missing endpoint or disabled game feature for successful deletion', async () => {
    request.mockRejectedValue(new AppError('NOT_FOUND', 404));
    renderDelete();
    confirm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled());
    expect(deleted).not.toHaveBeenCalled();
  });
});

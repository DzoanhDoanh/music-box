// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

let Captcha: typeof import('../../src/client/components/Captcha').default;
beforeAll(async () => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'fixture-site-key');
  Captcha = (await import('../../src/client/components/Captcha')).default;
});
afterEach(() => {
  cleanup();
  delete window.turnstile;
});
it('renews a consumed challenge and ignores callbacks from the previous widget', async () => {
  const renderWidget = vi.fn<NonNullable<Window['turnstile']>['render']>(() => crypto.randomUUID());
  const remove = vi.fn(),
    onToken = vi.fn();
  window.turnstile = { render: renderWidget, remove };
  const view = render(<Captcha onToken={onToken} resetKey={0} />);
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));
  const original = renderWidget.mock.calls[0][1];
  act(() => original.callback('consumed-token'));
  expect(onToken).toHaveBeenLastCalledWith('consumed-token');
  view.rerender(<Captcha onToken={onToken} resetKey={1} />);
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(2));
  expect(remove).toHaveBeenCalledTimes(1);
  expect(onToken).toHaveBeenLastCalledWith('');
  const count = onToken.mock.calls.length;
  act(() => original.callback('late-token'));
  expect(onToken).toHaveBeenCalledTimes(count);
  act(() => renderWidget.mock.calls[1][1].callback('new-token'));
  expect(onToken).toHaveBeenLastCalledWith('new-token');
});

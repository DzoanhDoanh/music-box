// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('YT', undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document
    .querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')
    .forEach((script) => script.remove());
});

describe('YouTube recovery', () => {
  it('shares one loader, cleans failed scripts, and ignores the previous attempt after retry', async () => {
    const { loadYouTube } = await import('../../src/client/lib/youtube');
    const first = loadYouTube();
    const rejection = expect(first).rejects.toThrow('Không kết nối được YouTube');
    expect(loadYouTube()).toBe(first);
    const oldReady = window.onYouTubeIframeAPIReady;
    const script = document.querySelector('script')!;
    script.dispatchEvent(new Event('error'));
    await rejection;
    expect(script.isConnected).toBe(false);
    const retry = loadYouTube();
    expect(retry).not.toBe(first);
    oldReady?.();
    expect(loadYouTube()).toBe(retry);
    vi.stubGlobal('YT', { Player: vi.fn() });
    window.onYouTubeIframeAPIReady?.();
    await retry;
    await vi.advanceTimersByTimeAsync(20000);
    expect(document.querySelectorAll('script')).toHaveLength(1);
  });

  it('allows retry after the API loading deadline', async () => {
    const { loadYouTube } = await import('../../src/client/lib/youtube');
    const first = loadYouTube();
    const rejected = expect(first).rejects.toThrow('Không tải được YouTube Player');
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(document.querySelectorAll('script')).toHaveLength(0);
    const retry = loadYouTube();
    vi.stubGlobal('YT', { Player: vi.fn() });
    window.onYouTubeIframeAPIReady?.();
    await retry;
  });

  it('builds only YouTube links with encoded IDs and valid start times', async () => {
    const { youtubeWatchUrl } = await import('../../src/client/lib/youtube');
    const url = new URL(youtubeWatchUrl('a&b#c', 45.8));
    expect(url.origin).toBe('https://www.youtube.com');
    expect(url.searchParams.get('v')).toBe('a&b#c');
    expect(url.searchParams.get('t')).toBe('45s');
    expect(youtubeWatchUrl('id', NaN)).toContain('t=0s');
    expect(youtubeWatchUrl('id', -50)).toContain('t=0s');
  });
});

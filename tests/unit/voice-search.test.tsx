// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVoiceSearch, type VoiceRecognition } from '../../src/client/lib/voice-search';
let instances: FakeVoice[];
class FakeVoice implements VoiceRecognition {
  lang = '';
  continuous = true;
  interimResults = false;
  onstart: VoiceRecognition['onstart'] = null;
  onend: VoiceRecognition['onend'] = null;
  onerror: VoiceRecognition['onerror'] = null;
  onresult: VoiceRecognition['onresult'] = null;
  start = vi.fn(() => this.onstart?.());
  abort = vi.fn();
  constructor() {
    instances.push(this);
  }
  result(text: string, final = true) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: final, 0: { transcript: text } }] });
  }
}
beforeEach(() => {
  instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('SpeechRecognition', FakeVoice);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('only starts by gesture, returns one final transcript, ignores interim and closes the microphone', () => {
  const onText = vi.fn(),
    { result } = renderHook(() => useVoiceSearch(onText));
  expect(instances).toHaveLength(0);
  act(() => result.current.start());
  expect(instances[0].lang).toBe('vi-VN');
  act(() => instances[0].result('chưa xong', false));
  expect(onText).not.toHaveBeenCalled();
  expect(result.current.interim).toBe('chưa xong');
  const late = instances[0].onresult!;
  act(() => instances[0].result('  Em   về đi  '));
  expect(onText).toHaveBeenCalledExactlyOnceWith('Em về đi');
  expect(instances[0].abort).toHaveBeenCalledTimes(1);
  expect(result.current.state).toBe('idle');
  act(() => late({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'late' } }] }));
  expect(onText).toHaveBeenCalledTimes(1);
});
it('stops on cancel, timeout, unmount and ignores callbacks from an obsolete session', () => {
  const onText = vi.fn(),
    { result, unmount } = renderHook(() => useVoiceSearch(onText));
  act(() => result.current.start());
  const stale = instances[0].onresult!;
  act(() => result.current.cancel());
  act(() => result.current.start());
  act(() => stale({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'wrong' } }] }));
  expect(onText).not.toHaveBeenCalled();
  expect(result.current.state).toBe('listening');
  act(() => vi.advanceTimersByTime(20000));
  expect(result.current.state).toBe('idle');
  act(() => result.current.start());
  unmount();
  expect(instances[2].abort).toHaveBeenCalled();
});
it.each(['not-allowed', 'network', 'audio-capture', 'no-speech'])(
  'explains %s without submitting a search',
  (error) => {
    const onText = vi.fn(),
      { result } = renderHook(() => useVoiceSearch(onText));
    act(() => result.current.start());
    act(() => instances[0].onerror?.({ error }));
    expect(result.current.message).not.toBe('');
    expect(result.current.state).toBe('idle');
    expect(onText).not.toHaveBeenCalled();
  },
);
it('reports lack of browser support without opening a microphone', () => {
  vi.stubGlobal('SpeechRecognition', undefined);
  vi.stubGlobal('webkitSpeechRecognition', undefined);
  const { result } = renderHook(() => useVoiceSearch(vi.fn()));
  expect(result.current.supported).toBe(false);
  act(() => result.current.start());
  expect(instances).toHaveLength(0);
});

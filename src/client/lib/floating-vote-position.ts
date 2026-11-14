import { useLayoutEffect, useRef } from 'react';
import { notificationPosition } from './notification-position';

// Votes take the first available slot; chat and transient notices flow around them.
export function useFloatingVotePosition(minimized: boolean, dismissed: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (dismissed) return;
    let frame = 0;
    const place = () => {
      const node = ref.current;
      if (!node) return;
      const visible = window.visualViewport;
      const x = visible?.offsetLeft ?? 0,
        y = visible?.offsetTop ?? 0;
      const obstacles = [...document.querySelectorAll('.youtube-container iframe')]
        .map((player) => player.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({
          left: r.left - x,
          right: r.right - x,
          top: r.top - y,
          bottom: r.bottom - y,
        }));
      const slot = notificationPosition(
        visible?.width ?? innerWidth,
        visible?.height ?? innerHeight,
        minimized ? 60 : Math.min(node.scrollHeight, 440),
        obstacles,
        { cardWidth: minimized ? 260 : 360, minHeight: 48, edge: 'top' },
      );
      const before = node.style.cssText;
      // Extremely small viewports keep the notice reachable in document flow.
      Object.assign(
        node.style,
        slot
          ? {
              position: 'fixed',
              left: `${slot.left + x}px`,
              top: `${slot.top + y}px`,
              width: `${slot.width}px`,
              maxHeight: `${Math.min(slot.maxHeight, 440)}px`,
              visibility: 'visible',
            }
          : {
              position: 'relative',
              left: 'auto',
              top: 'auto',
              width: '100%',
              maxHeight: 'none',
              visibility: 'visible',
            },
      );
      if (before !== node.style.cssText) window.dispatchEvent(new Event('roomtune:overlay-layout'));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true, characterData: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.documentElement);
    if (ref.current) resize.observe(ref.current);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    place();
    return () => {
      cancelAnimationFrame(frame);
      mutation.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.dispatchEvent(new Event('roomtune:overlay-layout'));
    };
  }, [minimized, dismissed]);
  return ref;
}

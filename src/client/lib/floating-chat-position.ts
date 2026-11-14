import { useLayoutEffect, useRef, useState } from 'react';
import { notificationPosition, type Rectangle } from './notification-position';

export function floatingChatPosition(
  width: number,
  height: number,
  expanded: boolean,
  players: Rectangle[],
) {
  const desired = Math.min(540, height - 24);
  const window = expanded
    ? notificationPosition(width, height, desired, players, { cardWidth: 360, minHeight: 240 })
    : null;
  const slot =
    window ?? notificationPosition(width, height, 56, players, { cardWidth: 116, minHeight: 56 });
  return slot
    ? {
        left: slot.left,
        top: slot.top,
        width: slot.width,
        height: window ? Math.min(slot.maxHeight, desired) : 56,
        expanded: Boolean(window),
      }
    : null;
}

export function useFloatingChatPosition(expanded: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [canOpen, setCanOpen] = useState(false);
  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      if (!ref.current) return;
      const visible = window.visualViewport;
      const x = visible?.offsetLeft ?? 0,
        y = visible?.offsetTop ?? 0;
      const players = [...document.querySelectorAll('.youtube-container iframe, .floating-vote')]
        .map((element) => element.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({
          left: r.left - x,
          right: r.right - x,
          top: r.top - y,
          bottom: r.bottom - y,
        }));
      const position = floatingChatPosition(
        visible?.width ?? innerWidth,
        visible?.height ?? innerHeight,
        expanded,
        players,
      );
      setCanOpen(position?.expanded ?? false);
      const before = ref.current.style.cssText;
      Object.assign(
        ref.current.style,
        position
          ? {
              left: `${position.left + x}px`,
              top: `${position.top + y}px`,
              width: `${position.width}px`,
              height: `${position.height}px`,
              visibility: 'visible',
            }
          : { visibility: 'hidden' },
      );
      if (before !== ref.current.style.cssText)
        window.dispatchEvent(new Event('roomtune:overlay-layout'));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true, characterData: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.documentElement);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('roomtune:overlay-layout', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    place();
    return () => {
      cancelAnimationFrame(frame);
      mutation.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('roomtune:overlay-layout', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [expanded]);
  return { ref, canOpen };
}

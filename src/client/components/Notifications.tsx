import { useLayoutEffect } from 'react';
import { Toaster } from 'sonner';
import { notificationPosition } from '../lib/notification-position';

export default function Notifications({ light }: { light: boolean }) {
  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      const viewport = document.querySelector<HTMLElement>('[data-sonner-toaster]');
      const card = viewport?.querySelector<HTMLElement>('[data-sonner-toast][data-front="true"]');
      if (!viewport || !card) return;
      const visible = window.visualViewport;
      const offsetLeft = visible?.offsetLeft ?? 0,
        offsetTop = visible?.offsetTop ?? 0;
      const players = [
        ...document.querySelectorAll('.youtube-container iframe, .chat-dock, .floating-vote'),
      ]
        .map((player) => player.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({
          left: r.left - offsetLeft,
          right: r.right - offsetLeft,
          top: r.top - offsetTop,
          bottom: r.bottom - offsetTop,
        }));
      const position = notificationPosition(
        visible?.width ?? innerWidth,
        visible?.height ?? innerHeight,
        Math.max(card.offsetHeight, card.scrollHeight + 2),
        players,
      );
      // A viewport too small for both a video and a readable notice uses document flow.
      Object.assign(
        viewport.style,
        position
          ? {
              position: 'fixed',
              left: `${position.left + offsetLeft}px`,
              top: `${position.top + offsetTop}px`,
              right: 'auto',
              bottom: 'auto',
              width: `${position.width}px`,
              visibility: 'visible',
            }
          : {
              position: 'relative',
              left: 'auto',
              top: 'auto',
              right: 'auto',
              bottom: 'auto',
              visibility: 'visible',
            },
      );
      card.style.maxHeight = position ? `${position.maxHeight}px` : 'none';
      card.style.overflowY = 'auto';
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true, characterData: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.documentElement);
    const viewport = document.querySelector('[data-sonner-toaster]');
    if (viewport) resize.observe(viewport);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('roomtune:overlay-layout', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
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
  }, []);
  return (
    <Toaster
      theme={light ? 'light' : 'dark'}
      richColors
      closeButton
      position="top-right"
      visibleToasts={1}
      containerAriaLabel="Thông báo"
      style={{ visibility: 'hidden' }}
      toastOptions={{ duration: 5000, closeButtonAriaLabel: 'Đóng thông báo' }}
    />
  );
}

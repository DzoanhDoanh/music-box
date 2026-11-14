import { useEffect, useId, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import './queue-drag.css';

/** Only the handle captures gestures; the rest of a song row remains scrollable. */
export default function QueueDragHandle({
  entry,
  title,
  ids,
  disabled,
  onPreview,
  onMove,
}: {
  entry: string;
  title: string;
  ids: string[];
  disabled: boolean;
  onPreview: (value: { source: string; target: string } | null) => void;
  onMove: (source: string, target: string) => Promise<unknown>;
}) {
  const helpId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{
    pointer: number | null;
    x: number;
    y: number;
    target: string;
    moved: boolean;
  } | null>(null);
  const frame = useRef(0);
  const lastPreview = useRef<string | null>(null);
  const [active, setActive] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const orderKey = ids.join(',');

  function cancel() {
    cancelAnimationFrame(frame.current);
    gesture.current = null;
    lastPreview.current = null;
    setActive(false);
    onPreview(null);
  }
  useEffect(() => {
    // A concurrent queue change invalidates the gesture, never the server order.
    gesture.current = null;
    lastPreview.current = null;
    cancelAnimationFrame(frame.current);
    setActive(false);
    onPreview(null);
    return () => cancelAnimationFrame(frame.current);
  }, [orderKey, disabled, onPreview]);

  function preview(target: string) {
    const current = gesture.current;
    if (!current || !ids.includes(target)) return;
    current.target = target;
    if (lastPreview.current === target) return;
    lastPreview.current = target;
    onPreview({ source: entry, target });
    setAnnouncement(`Vị trí ${ids.indexOf(target) + 1} trên ${ids.length}. Thả để đổi vị trí.`);
  }
  function track() {
    const current = gesture.current;
    if (!current || current.pointer === null || !current.moved) return;
    const list = button.current?.closest('.queue-panel');
    const row = document
      .elementFromPoint(current.x, current.y)
      ?.closest<HTMLElement>('[data-queue-id]');
    if (row && list?.contains(row)) preview(row.dataset.queueId!);
    else {
      current.target = entry;
      lastPreview.current = null;
      onPreview(null);
    }
    // Continue scrolling near the viewport edge even when the finger is stationary.
    const edge = 72;
    const delta = current.y < edge ? -10 : current.y > innerHeight - edge ? 10 : 0;
    if (
      delta &&
      list &&
      current.x >= list.getBoundingClientRect().left &&
      current.x <= list.getBoundingClientRect().right
    )
      window.scrollBy(0, delta);
    frame.current = requestAnimationFrame(track);
  }
  function finish() {
    const current = gesture.current;
    cancel();
    if (current && current.target !== entry && !disabled)
      void onMove(entry, current.target).catch(() => {});
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="queue-drag-handle"
        disabled={disabled}
        aria-label={`Kéo đổi vị trí ${title}`}
        aria-describedby={helpId}
        aria-pressed={active}
        title="Giữ và kéo để đổi vị trí"
        onPointerDown={(event) => {
          if (disabled || !event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          cancel();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = {
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            target: entry,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.pointer !== event.pointerId) return;
          if (
            !current.moved &&
            Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5
          )
            return;
          current.x = event.clientX;
          current.y = event.clientY;
          if (!current.moved) {
            current.moved = true;
            setActive(true);
            track();
          }
        }}
        onPointerUp={(event) => {
          if (gesture.current?.pointer !== event.pointerId) return;
          if (gesture.current.moved) {
            gesture.current.x = event.clientX;
            gesture.current.y = event.clientY;
            cancelAnimationFrame(frame.current);
            track();
          }
          finish();
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={() => {
          if (gesture.current?.pointer != null) cancel();
        }}
        onBlur={cancel}
        onClick={(event) => {
          if (event.detail !== 0) return;
          if (gesture.current) finish();
          else {
            gesture.current = { pointer: null, x: 0, y: 0, target: entry, moved: false };
            setActive(true);
            preview(entry);
          }
        }}
        onKeyDown={(event) => {
          const current = gesture.current;
          if (!current) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          } else if (
            current.pointer === null &&
            ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
          ) {
            event.preventDefault();
            const index = ids.indexOf(current.target);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? ids.length - 1
                  : index + (event.key === 'ArrowUp' ? -1 : 1);
            preview(ids[Math.max(0, Math.min(ids.length - 1, next))]);
            const list = button.current?.closest('.queue-panel');
            Array.from(list?.querySelectorAll<HTMLElement>('[data-queue-id]') ?? [])
              .find((row) => row.dataset.queueId === gesture.current?.target)
              ?.scrollIntoView({ block: 'nearest' });
          }
        }}
      >
        <GripVertical size={19} aria-hidden="true" />
        <span>Kéo</span>
      </button>
      <span id={helpId} className="sr-only">
        Giữ nút và kéo lên hoặc xuống. Bàn phím: Enter để chọn, mũi tên để di chuyển, Enter để lưu,
        Escape để hủy.
      </span>
      <span className="sr-only" role="status">
        {active ? announcement : ''}
      </span>
    </>
  );
}

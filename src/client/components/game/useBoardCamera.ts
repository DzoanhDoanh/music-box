import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { OrthographicCamera, Vector3 } from 'three';

type Size = { width: number; height: number };
type View = { yaw: number; pitch: number; zoom: number };
// Pitch is measured from overhead. Keep at least 70% of the board's depth
// visible instead of letting a low viewing angle flatten the squares and circles.
const maxPitch = (45 * Math.PI) / 180;
// Enter 3D facing the board squarely at the full allowed tilt, one zoom step closer.
const initialView = () => ({
  yaw: 0,
  pitch: maxPitch,
  zoom: 1.2,
});
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Camera gestures are presentation only. Update HTML hit targets with the SAME camera,
 * without re-rendering the game or sending commands while dragging. */
export function useBoardCamera(host: RefObject<HTMLDivElement | null>, size: Size) {
  const camera = useMemo(() => new OrthographicCamera(-1, 1, 1, -1, 0.1, 100), []);
  const view = useRef<View>(initialView());
  const viewport = useRef(size);
  const invalidate = useRef<(() => void) | null>(null);
  const pointers = useRef(
    new Map<number, { x: number; y: number; originX: number; originY: number; touch: boolean }>(),
  );
  const suppressClick = useRef(false);
  const sync = useCallback(() => {
    const element = host.current;
    if (!element) return;
    const { width, height } = viewport.current;
    camera.updateMatrixWorld();
    for (const node of element.querySelectorAll<HTMLElement>('[data-board-x]')) {
      const point = new Vector3(
        Number(node.dataset.boardX) - 7.5,
        Number(node.dataset.boardElevation ?? 0.6),
        Number(node.dataset.boardY) - 7.5,
      ).project(camera);
      node.style.left = ((point.x + 1) * width) / 2 + 'px';
      node.style.top = ((1 - point.y) * height) / 2 + 'px';
      if (node.dataset.boardScale) {
        const scale = Number(node.dataset.boardScale);
        node.style.width = Math.max(8, camera.zoom * 0.9 * scale) + 'px';
        node.style.height = Math.max(10, camera.zoom * 1.18 * scale) + 'px';
      } else {
        node.style.width = node.style.height = Math.max(8, Math.min(36, camera.zoom * 0.9)) + 'px';
      }
    }
    element.dataset.cameraYaw = view.current.yaw.toFixed(4);
    element.dataset.cameraPitch = view.current.pitch.toFixed(4);
    element.dataset.cameraZoom = view.current.zoom.toFixed(4);
    element.style.setProperty(
      '--piece-label-scale',
      String(Math.min(1, Math.max(0.55, camera.zoom / 16))),
    );
    invalidate.current?.();
  }, [camera, host]);
  const update = useCallback(() => {
    const { width, height } = viewport.current,
      { yaw, pitch, zoom } = view.current;
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.position.set(
      30 * Math.sin(pitch) * Math.sin(yaw),
      30 * Math.cos(pitch),
      30 * Math.sin(pitch) * Math.cos(yaw),
    );
    camera.lookAt(0, 0, 0);
    camera.zoom = Math.min(width / 18.8, height / 17.2) * zoom;
    camera.updateProjectionMatrix();
    sync();
  }, [camera, sync]);
  const rotate = useCallback(
    (dx: number, dy: number) => {
      view.current.yaw -= dx;
      view.current.pitch = clamp(view.current.pitch - dy, 0.12, maxPitch);
      update();
    },
    [update],
  );
  const zoom = useCallback(
    (factor: number) => {
      view.current.zoom = clamp(view.current.zoom * factor, 0.7, 2.2);
      update();
    },
    [update],
  );
  const reset = useCallback(() => {
    view.current = initialView();
    update();
  }, [update]);
  useLayoutEffect(() => {
    viewport.current = size;
    update();
  }, [size, update]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.current.height : 1);
      zoom(Math.exp(-clamp(delta, -200, 200) * 0.002));
    };
    const cancel = () => {
      if (pointers.current.size) suppressClick.current = true;
      pointers.current.clear();
      element.classList.remove('is-orbiting');
    };
    element.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      element.removeEventListener('wheel', wheel);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, [host, zoom]);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (!pointers.current.size) suppressClick.current = false;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      touch: event.pointerType === 'touch',
    });
    if (pointers.current.size > 1) suppressClick.current = true;
    // Keep capture on the original button so an ordinary tap still activates it.
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointers.current.get(event.pointerId);
    if (!point) return;
    const dx = event.clientX - point.x,
      dy = event.clientY - point.y;
    if (Math.hypot(event.clientX - point.originX, event.clientY - point.originY) > 6)
      suppressClick.current = true;
    const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (point.touch && other) {
      const distance = Math.hypot(point.x - other.x, point.y - other.y);
      const nextDistance = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      view.current.zoom = clamp(
        view.current.zoom * (distance > 10 ? nextDistance / distance : 1),
        0.7,
        2.2,
      );
      rotate(dx * 0.004, dy * 0.004);
      host.current?.classList.add('is-orbiting');
    } else if (!point.touch && suppressClick.current) {
      rotate(dx * 0.007, dy * 0.007);
      host.current?.classList.add('is-orbiting');
    }
    point.x = event.clientX;
    point.y = event.clientY;
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.type === 'pointercancel') suppressClick.current = true;
    if (!pointers.current.size) host.current?.classList.remove('is-orbiting');
  };
  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    // Keyboard activation has detail=0 and must remain usable after any gesture.
    if (event.detail > 0 && suppressClick.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return {
    camera,
    invalidate,
    sync,
    rotate,
    zoom,
    reset,
    gestures: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture: onPointerUp,
      onClickCapture,
    },
  };
}

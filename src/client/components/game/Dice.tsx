import { useLayoutEffect, useRef } from 'react';

const pips = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
// Opposite faces sum to seven. The front-facing face always represents the committed value.
const rotations = [
  'rotateX(0deg) rotateY(0deg)',
  'rotateX(0deg) rotateY(-90deg)',
  'rotateX(-90deg) rotateY(0deg)',
  'rotateX(90deg) rotateY(0deg)',
  'rotateX(0deg) rotateY(90deg)',
  'rotateX(0deg) rotateY(180deg)',
];

export default function Dice({
  value,
  busy,
  eventKey,
  rolled,
}: {
  value: number | null;
  busy: boolean;
  eventKey: string;
  rolled: boolean;
}) {
  const cube = useRef<HTMLSpanElement>(null);
  const last = useRef(eventKey);
  const animation = useRef<Animation | null>(null);
  const transform = rotations[(value ?? 1) - 1];
  useLayoutEffect(() => {
    if (last.current === eventKey) return;
    const previous = last.current.split(':'),
      current = eventKey.split(':');
    last.current = eventKey;
    animation.current?.cancel();
    if (
      previous[0] !== current[0] ||
      previous[1] !== current[1] ||
      Number(current[2]) !== Number(previous[2]) + 1 ||
      !rolled ||
      !value ||
      document.hidden ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    // Presentation only: never invent a dice value or delay enabling a legal move.
    animation.current =
      cube.current?.animate?.(
        [
          { transform: 'translateY(-12px) rotateX(270deg) rotateY(225deg)', offset: 0 },
          { transform: 'translateY(-4px) ' + transform, offset: 0.75 },
          { transform },
        ],
        { duration: 620, easing: 'cubic-bezier(.2,.65,.25,1)' },
      ) ?? null;
  }, [eventKey, rolled, value, transform]);
  useLayoutEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => animation.current?.cancel();
    document.addEventListener('visibilitychange', stop);
    preference.addEventListener('change', stop);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', stop);
      preference.removeEventListener('change', stop);
    };
  }, []);
  return (
    <span
      role="img"
      className={'game-dice-scene' + (busy ? ' is-rolling' : '')}
      aria-label={busy ? 'Đang tung xúc xắc' : value ? 'Xúc xắc ' + value : 'Chưa tung xúc xắc'}
    >
      <span className="game-dice-lift" aria-hidden="true">
        <span ref={cube} className="game-dice-cube" style={{ transform }} data-value={value ?? ''}>
          {pips.map((face, number) => (
            <span className={'game-dice-face face-' + (number + 1)} key={number}>
              {!value && number === 0 ? (
                <b>?</b>
              ) : (
                Array.from({ length: 9 }, (_, i) => (
                  <i key={i} className={face.includes(i) ? 'pip' : ''} />
                ))
              )}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

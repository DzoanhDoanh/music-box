import type { RefObject } from 'react';
import CaptureBurst from './CaptureBurst';
import type { ScenePlan } from './scene-motion';

// Every catalogue entry supplies its renderer, copy and local demo choreography.
// Adding an effect does not need to add a new button or modify game state/API logic.
export const captureEffect = {
  id: 'capture-burst',
  name: 'K/O',
  description: 'Lao tới, bùng nổ năng lượng và hất đối thủ xoay về nhà.',
  eyebrow: 'ĐÒN KẾT LIỄU',
  headline: 'K/O',
  Renderer: CaptureBurst,
  demo: {
    cue: {
      points: [
        { x: -3, z: 0, scale: 1 },
        { x: -1.5, z: 0, scale: 1 },
        { x: 0, z: 0, scale: 1 },
      ],
      duration: 650,
      delay: 0,
      kind: 'jump',
    } satisfies ScenePlan,
    victim: {
      points: [
        { x: 0, z: 0, scale: 1 },
        { x: 3, z: -2, scale: 1 },
      ],
      duration: 1550,
      delay: 650,
      kind: 'capture',
    } satisfies ScenePlan,
  },
};
export const boardEffects = [captureEffect];
export type BoardEffect = (typeof boardEffects)[number];

export function EffectCallout({
  overlay,
  effect,
  color,
  detail,
}: {
  overlay: RefObject<HTMLDivElement | null>;
  effect: BoardEffect;
  color: number;
  detail: string;
}) {
  return (
    <div ref={overlay} className={'ludo-finisher ludo-color-' + color} hidden aria-hidden="true">
      <div className="ludo-finisher-wash" />
      <div className="ludo-finisher-callout">
        <span>{effect.eyebrow}</span>
        <strong>{effect.headline}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

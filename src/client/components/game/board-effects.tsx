import type { ComponentType, RefObject } from 'react';
import CaptureBurst, { type CaptureEffectProps } from './CaptureBurst';
import DragonStrike from './DragonStrike';
import RiderKick, { RiderAttacker } from './RiderKick';
import { riderCapturePlans, riderImpactMs } from './rider-motion';
import Kamehameha, { GokuAttacker } from './Kamehameha';
import { kameCapturePlans, kameImpactMs } from './kamehameha-motion';
import { directCapturePlans } from './direct-capture-motion';
import type { MovingPieceProps } from './MovingPiece';
import type { ScenePlan } from './scene-motion';
import type { CaptureEffectId } from '../../lib/capture-effect';

export type BoardEffect = {
  id: CaptureEffectId;
  name: string;
  description: string;
  eyebrow: string;
  headline: string;
  Renderer: ComponentType<CaptureEffectProps>;
  Attacker?: ComponentType<MovingPieceProps>;
  preparePlans?: (plans: Map<string, ScenePlan>, attacker: string) => Map<string, ScenePlan>;
  demo: { cue: ScenePlan; victim: ScenePlan };
};

// Every catalogue entry supplies its renderer, copy and local demo choreography.
// Adding an effect does not need to add a new button or modify game state/API logic.
export const captureEffect: BoardEffect = {
  id: 'capture-burst',
  name: 'K/O',
  description: 'Lao thẳng từ ô đang đứng tới đối thủ, bùng nổ năng lượng và K/O.',
  eyebrow: 'ĐÒN KẾT LIỄU',
  headline: 'K/O',
  Renderer: CaptureBurst,
  preparePlans: (plans, attacker) => directCapturePlans(plans, attacker, 650),
  demo: {
    cue: {
      points: [
        { x: -3, z: 0, scale: 1 },
        { x: 0, z: 0, scale: 1 },
      ],
      duration: 650,
      delay: 0,
      kind: 'strike',
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
export const dragonEffect: BoardEffect = {
  id: 'dragon-strike',
  name: 'Long quyền',
  description: 'Rồng ngọc lao thẳng từ ô đang đứng tới mục tiêu, bùng nổ xung kích và K/O.',
  eyebrow: 'LONG QUYỀN',
  headline: 'K/O',
  Renderer: DragonStrike,
  preparePlans: (plans, attacker) => directCapturePlans(plans, attacker, 900),
  demo: {
    cue: { ...captureEffect.demo.cue, duration: 900 },
    victim: { ...captureEffect.demo.victim, duration: 1800, delay: 900 },
  },
};
export const riderEffect: BoardEffect = {
  id: 'rider-kick',
  name: 'Rider Kick',
  description: 'Biến thành Kamen Rider, bật lên tung cú đá kết liễu rồi trở lại quân đã chọn.',
  eyebrow: 'RIDER KICK',
  headline: 'K/O',
  Renderer: RiderKick,
  Attacker: RiderAttacker,
  preparePlans: riderCapturePlans,
  demo: {
    cue: { ...captureEffect.demo.cue, kind: 'rider-kick', duration: riderImpactMs },
    victim: { ...captureEffect.demo.victim, duration: riderImpactMs + 900, delay: riderImpactMs },
  },
};
export const kameEffect: BoardEffect = {
  id: 'kamehameha',
  name: 'Kamehameha',
  description: 'Biến thành Goku, tụ khí và bắn chưởng Kamehameha rồi trở lại quân đã chọn.',
  eyebrow: 'KAMEHAMEHA',
  headline: 'K/O',
  Renderer: Kamehameha,
  Attacker: GokuAttacker,
  preparePlans: kameCapturePlans,
  demo: {
    cue: {
      ...captureEffect.demo.cue,
      points: [
        { x: -3.5, z: 0, scale: 1 },
        { x: 0, z: 0, scale: 1 },
      ],
      kind: 'kamehameha',
      duration: kameImpactMs,
    },
    victim: { ...captureEffect.demo.victim, duration: kameImpactMs + 900, delay: kameImpactMs },
  },
};
export const boardEffects: readonly BoardEffect[] = [
  captureEffect,
  dragonEffect,
  riderEffect,
  kameEffect,
];
export const getBoardEffect = (id: CaptureEffectId) =>
  boardEffects.find((effect) => effect.id === id) ?? captureEffect;

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
    <div
      ref={overlay}
      className={'ludo-finisher ludo-color-' + color}
      data-effect={effect.id}
      hidden
      aria-hidden="true"
    >
      <div className="ludo-finisher-wash" />
      <div className="ludo-finisher-callout">
        <span>{effect.eyebrow}</span>
        <strong>{effect.headline}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

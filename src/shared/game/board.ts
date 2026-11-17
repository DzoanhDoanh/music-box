import { usesAutomaticMovement, type GameRules } from './contracts';

export type BoardVersion = 1 | 2;
export const trackLength = (schema: BoardVersion) => (schema === 2 ? 56 : 52);
export const gateProgress = (schema: BoardVersion) => trackLength(schema) - 1;
export const lastPosition = (schema: BoardVersion) => trackLength(schema) + 5;
export function boardCell(color: number, progress: number, schema: BoardVersion = 1) {
  const length = trackLength(schema);
  return (color * (length / 4) + progress) % length;
}
export function nextGate(progress: number) {
  // Relative gates are 13, 27, 41 and 55. Own gate ends the circuit.
  return Math.min(55, (Math.floor((progress + 1) / 14) + 1) * 14 - 1);
}
/** Stored coordinates stay unchanged; only foreign protected starts cost no dice step. */
export function skipsStart(progress: number, rules: GameRules) {
  return (
    usesAutomaticMovement(rules) &&
    rules.safe === 'STARTS' &&
    progress > 0 &&
    progress < 56 &&
    progress % 14 === 0
  );
}
export function trackStepTarget(from: number, dice: number, rules: GameRules) {
  let to = from;
  for (let steps = 0; steps < dice; steps++) {
    do {
      to++;
    } while (skipsStart(to, rules));
  }
  return to;
}
export function countedDistance(from: number, to: number, rules: GameRules) {
  let steps = 0;
  for (let n = from + 1; n <= to; n++) if (!skipsStart(n, rules)) steps++;
  return steps;
}

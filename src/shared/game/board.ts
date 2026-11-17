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

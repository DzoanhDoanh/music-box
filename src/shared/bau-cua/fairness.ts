const encoder = new TextEncoder();
export const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
export async function commitment(seed: string) {
  if (!/^[0-9a-f]{64}$/.test(seed)) throw new Error('Invalid seed');
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(seed))));
}
export function acceptedFaces(bytes: Uint8Array): number[] {
  return Array.from(bytes)
    .filter((n) => n < 252)
    .map((n) => n % 6);
}
export async function diceFromSeed(round: string, seed: string) {
  if (!/^[0-9a-f-]{36}$/.test(round)) throw new Error('Invalid round');
  await commitment(seed);
  const dice: number[] = [];
  for (let counter = 0; dice.length < 3; counter++) {
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(`ROOMTUNE:BAU_CUA:v1:${round}:${seed}:${counter}`),
      ),
    );
    dice.push(...acceptedFaces(digest));
  }
  return dice.slice(0, 3);
}
export async function verifyRound(
  round: string,
  seed: string,
  hash: string,
  dice: readonly number[],
) {
  return (
    (await commitment(seed)) === hash &&
    JSON.stringify(await diceFromSeed(round, seed)) === JSON.stringify(dice)
  );
}
